import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentMethod, Prisma } from "@prisma/client";
import { verifyAuth } from "@/lib/auth";
import { formatOrderResponse } from "@/lib/orders";
import { createNotification } from "@/lib/notifications";
import {
  computeRiderEarning,
  loadActiveDeliveryFeeConfig,
  quoteDelivery,
} from "@/lib/delivery-fee";
import { SETTLED_PAYMENT_FILTER } from "@/lib/payment-visibility";

/**
 * POST /api/orders
 *
 * Create a new order on behalf of the signed-in CUSTOMER.
 *
 *   • Customer-only — partners / riders 403.
 *   • Body:
 *       { restaurantId: string,
 *         items: Array<{ menuItemId: string, quantity: number }>,
 *         deliveryAddress: string,
 *         paymentMethod: "CASH" | "BKASH" | "NAGAD" | "CARD" }
 *
 *   • Server-side price calculation — the client can't spoof the total.
 *     We re-read each menuItem from the DB, verify it belongs to the
 *     restaurant, sum up subtotal, apply the restaurant's deliveryFee,
 *     and compute tax = round(subtotal × 0.05). Total is then
 *     subtotal + deliveryFee + tax.
 *
 *   • Responses:
 *       201 { order: OrderApi }
 *       400 validation error
 *       401 missing / invalid token
 *       403 not a customer
 *       404 restaurant / menu items unknown
 *       500 server error
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Only customers can place orders" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const patch = body as Record<string, unknown>;

  const restaurantId =
    typeof patch.restaurantId === "string" ? patch.restaurantId : "";
  const itemsRaw = Array.isArray(patch.items) ? patch.items : [];
  const deliveryAddress =
    typeof patch.deliveryAddress === "string"
      ? patch.deliveryAddress.trim()
      : "";
  const paymentMethod =
    typeof patch.paymentMethod === "string" ? patch.paymentMethod : "";
  // Optional promo code. The checkout page POSTs the same
  // `discountAmount` it received from /api/promo-codes/validate;
  // here we re-validate the code against current DB state and use
  // the recomputed amount (so a stale client value can't bypass
  // expiry / usage-cap races). When the code is missing or blank
  // we treat the discount as 0.
  const promoCodeRaw =
    typeof patch.promoCode === "string" ? patch.promoCode.trim() : "";
  const promoCode = promoCodeRaw ? promoCodeRaw.toUpperCase() : null;

  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required" },
      { status: 400 },
    );
  }
  if (!deliveryAddress) {
    return NextResponse.json(
      { error: "deliveryAddress is required" },
      { status: 400 },
    );
  }
  if (deliveryAddress.length < 4) {
    return NextResponse.json(
      { error: "deliveryAddress must be at least 4 characters" },
      { status: 400 },
    );
  }
  // Source of truth: the Prisma `PaymentMethod` enum, so this list
  // can't drift when a new provider is added to the schema.
  const VALID_PAYMENT_METHODS = Object.values(PaymentMethod);
  if (
    !VALID_PAYMENT_METHODS.includes(
      paymentMethod as PaymentMethod,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "paymentMethod must be one of: " +
          VALID_PAYMENT_METHODS.join(", "),
      },
      { status: 400 },
    );
  }
  if (itemsRaw.length === 0) {
    return NextResponse.json(
      { error: "items must contain at least one entry" },
      { status: 400 },
    );
  }

  // ---- Parse items + validate qty -----------------------------------
  // Feat 1 — `selectedOptions` carries the customer's choices per
  // option group. Shape:
  //   Array<{
  //     optionId: string,
  //     choiceIds: string[], // exactly one for SINGLE_CHOICE
  //   }>
  // Feat 2 — `specialInstructions` is the order-level free-text
  // note from the customer.
  type ParsedItem = {
    menuItemId: string;
    quantity: number;
    selectedOptions: Array<{ optionId: string; choiceIds: string[] }>;
  };
  const parsed: ParsedItem[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json(
        { error: "Each item must be a JSON object" },
        { status: 400 },
      );
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj.menuItemId !== "string" || !obj.menuItemId) {
      return NextResponse.json(
        { error: "Each item must have a menuItemId string" },
        { status: 400 },
      );
    }
    const qty =
      typeof obj.quantity === "number"
        ? obj.quantity
        : typeof obj.quantity === "string"
          ? parseInt(obj.quantity, 10)
          : NaN;
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      return NextResponse.json(
        { error: "Each item quantity must be between 1 and 50" },
        { status: 400 },
      );
    }
    // Feat 1 — selectedOptions is optional. If absent / empty,
    // the item behaves like a plain no-customisation menu item.
    const rawOpts = obj.selectedOptions;
    let selectedOptions: ParsedItem["selectedOptions"] = [];
    if (Array.isArray(rawOpts)) {
      selectedOptions = [];
      for (const optEntry of rawOpts) {
        if (!optEntry || typeof optEntry !== "object") {
          return NextResponse.json(
            {
              error:
                "Each item's selectedOptions must be an array of {optionId, choiceIds[]}",
            },
            { status: 400 },
          );
        }
        const oo = optEntry as Record<string, unknown>;
        if (typeof oo.optionId !== "string" || !oo.optionId) {
          return NextResponse.json(
            { error: "selectedOptions[].optionId must be a string" },
            { status: 400 },
          );
        }
        const rawChoiceIds = oo.choiceIds;
        if (!Array.isArray(rawChoiceIds)) {
          return NextResponse.json(
            {
              error:
                "selectedOptions[].choiceIds must be an array of strings",
            },
            { status: 400 },
          );
        }
        const choiceIds: string[] = [];
        for (const cid of rawChoiceIds) {
          if (typeof cid !== "string" || !cid) {
            return NextResponse.json(
              { error: "selectedOptions[].choiceIds[] must be strings" },
              { status: 400 },
            );
          }
          choiceIds.push(cid);
        }
        selectedOptions.push({ optionId: oo.optionId, choiceIds });
      }
    } else if (rawOpts !== undefined && rawOpts !== null) {
      return NextResponse.json(
        {
          error: "selectedOptions must be an array if provided",
        },
        { status: 400 },
      );
    }
    parsed.push({
      menuItemId: obj.menuItemId,
      quantity: qty,
      selectedOptions,
    });
  }

  // Feat 2 — optional order-level customer note. Trim + cap at
  // 300 chars so a malicious client can't blow up the column or
  // store absurd garbage.
  const rawSpecial = patch.specialInstructions;
  let specialInstructions: string | null = null;
  if (typeof rawSpecial === "string") {
    const trimmed = rawSpecial.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 300) {
        return NextResponse.json(
          {
            error:
              "specialInstructions must be 300 characters or fewer",
          },
          { status: 400 },
        );
      }
      specialInstructions = trimmed;
    }
  } else if (rawSpecial !== undefined && rawSpecial !== null) {
    return NextResponse.json(
      { error: "specialInstructions must be a string if provided" },
      { status: 400 },
    );
  }

  // ---- Verify restaurant + load menuItems atomically ----------------
  const [restaurant, menuItems] = await Promise.all([
    prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        // ধাপ ৪ — a customer can't order from a restaurant the
        // admin hasn't approved yet. Returning 404 (not 403) so we
        // don't accidentally leak whether the restaurant exists in
        // any non-APPROVED state.
        deletedAt: null,
        verificationStatus: "APPROVED",
        isSuspended: false,
      },
      select: {
        id: true,
        isAcceptingOrders: true,
        isSuspended: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId, available: true },
      // Feat 1 — load every option group + choice so the
      // server-side validation can verify the customer's
      // selections and recompute line prices from authoritative
      // `priceDelta` values.
      include: {
        options: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: {
            choices: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            },
          },
        },
      },
    }),
  ]);
  if (!restaurant) {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404 },
    );
  }
  // কাজ ২ — partner flipped the "Accepting Orders" toggle off.
  // Refuse the order at the API so a hand-crafted POST can't bypass
  // the disabled Add buttons on the customer detail page.
  if (restaurant.isAcceptingOrders === false) {
    return NextResponse.json(
      {
        error:
          "This restaurant is currently closed and isn't accepting new orders.",
      },
      { status: 400 },
    );
  }
  if (restaurant.isSuspended) {
    return NextResponse.json(
      { error: "This restaurant is temporarily unavailable." },
      { status: 400 },
    );
  }
  const menuById = new Map(menuItems.map((m) => [m.id, m]));
  const missing: string[] = [];
  for (const it of parsed) {
    if (!menuById.has(it.menuItemId)) {
      missing.push(it.menuItemId);
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error:
          "These menu items don't belong to the restaurant (or are unavailable): " +
          missing.join(", "),
      },
      { status: 400 },
    );
  }

  // ---- Server-side price calc ---------------------------------------
  // Feat 1 — every item gets re-priced server-side from the
  // authoritative `menuItem.price` + the sum of the
  // customer-selected `priceDelta` values. The client cannot
  // spoof totals. We also build a JSON snapshot of the
  // selected option groups (option/choice ids + denormalised
  // name/label/priceDelta) so historical orders survive the
  // partner editing their menu later.
  let subtotal = 0;
  const orderItems: Array<{
    menuItemId: string;
    quantity: number;
    price: number;
    selectedOptions: Prisma.InputJsonValue | null;
  }> = [];
  // Feat 1 — Type alias for the menuItem shape we expect from
  // Prisma (with the `options.choices` include).
  type LoadedMenuItem = (typeof menuItems)[number];
  for (const it of parsed) {
    const m = menuById.get(it.menuItemId) as LoadedMenuItem;
    // Index option/choice by id for O(1) lookup.
    const optionById = new Map(m.options.map((o) => [o.id, o]));
    const choiceById = new Map(
      m.options.flatMap((o) => o.choices.map((c) => [c.id, c])),
    );
    const chosenOptionIds = new Set(
      it.selectedOptions.map((so) => so.optionId),
    );
    // 1) Reject any option / choice the client sent that doesn't
    //    actually belong to this menu item — protects against
    //    hand-crafted POSTs that try to "discount" the line.
    for (const so of it.selectedOptions) {
      if (!optionById.has(so.optionId)) {
        return NextResponse.json(
          {
            error: `Option ${so.optionId} is not available on menu item "${m.name}"`,
          },
          { status: 400 },
        );
      }
      if (so.choiceIds.length === 0) {
        // Allow the group to be sent with no choice — we'll only
        // require at least one if the group is `required`.
        continue;
      }
      for (const cid of so.choiceIds) {
        const c = choiceById.get(cid);
        if (!c || c.optionId !== so.optionId) {
          return NextResponse.json(
            {
              error: `Choice ${cid} is not available for option ${so.optionId} on "${m.name}"`,
            },
            { status: 400 },
          );
        }
      }
    }
    // 2) Enforce per-option selection rules: SINGLE_CHOICE
    //    exactly one, MULTI_CHOICE zero or more, required
    //    groups at least one.
    let priceDeltaSum = 0;
    const snapshot: Array<{
      optionId: string;
      choiceIds: string[];
      name: string;
      choiceLabels: string[];
      priceDelta: number;
    }> = [];
    // Walk the *menuItem's* option list so every required
    // group is checked even if the client omitted it.
    for (const opt of m.options) {
      const submitted = it.selectedOptions.find(
        (so) => so.optionId === opt.id,
      );
      const submittedChoiceIds = submitted?.choiceIds ?? [];
      if (opt.required && submittedChoiceIds.length === 0) {
        return NextResponse.json(
          {
            error: `"${m.name}" requires a selection for "${opt.name}"`,
          },
          { status: 400 },
        );
      }
      if (opt.type === "SINGLE_CHOICE" && submittedChoiceIds.length > 1) {
        return NextResponse.json(
          {
            error: `"${opt.name}" on "${m.name}" is a single-choice group — pick exactly one option`,
          },
          { status: 400 },
        );
      }
      if (submittedChoiceIds.length === 0) continue;
      const optDelta = submittedChoiceIds.reduce(
        (acc, cid) => acc + (choiceById.get(cid)?.priceDelta ?? 0),
        0,
      );
      priceDeltaSum += optDelta;
      snapshot.push({
        optionId: opt.id,
        choiceIds: submittedChoiceIds,
        name: opt.name,
        choiceLabels: submittedChoiceIds.map(
          (cid) => choiceById.get(cid)?.label ?? "",
        ),
        priceDelta: optDelta,
      });
    }
    // 3) Reject if the client submitted duplicate optionIds
    //    (e.g. two `optionId: "X"` entries).
    if (chosenOptionIds.size !== it.selectedOptions.length) {
      return NextResponse.json(
        { error: "Duplicate option selections in one item" },
        { status: 400 },
      );
    }
    // 4) Recompute the authoritative line price.
    const linePrice = Math.max(0, m.price + priceDeltaSum);
    subtotal += linePrice * it.quantity;
    orderItems.push({
      menuItemId: m.id,
      quantity: it.quantity,
      price: linePrice,
      selectedOptions: snapshot.length > 0 ? snapshot : null,
    });
  }
  const { lat, lng } = patch;

  // ---- Server-side delivery fee -------------------------------------
  // The customer-facing fee + the rider's earnings no longer come
  // from `restaurant.deliveryFee`; the platform owns the schedule
  // via `DeliveryFeeConfig`. We compute from the distance between
  // the restaurant pin and the customer's chosen pin (if any). If
  // the customer didn't supply a pin we fall back to `baseFee`.
  const feeConfig = await loadActiveDeliveryFeeConfig();
  let distanceKm: number | null = null;
  let deliveryFee = feeConfig.baseFee;
  let riderEarning = computeRiderEarning(feeConfig, deliveryFee);
  const deliveryLat =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90
      ? lat
      : null;
  const deliveryLng =
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
      ? lng
      : null;

  if (
    deliveryLat !== null &&
    deliveryLng !== null &&
    restaurant.latitude !== null &&
    restaurant.longitude !== null &&
    Number.isFinite(restaurant.latitude) &&
    Number.isFinite(restaurant.longitude)
  ) {
    const quote = quoteDelivery(
      feeConfig,
      restaurant.latitude,
      restaurant.longitude,
      deliveryLat,
      deliveryLng,
    );
    distanceKm = quote.distanceKm;
    deliveryFee = quote.fee;
    riderEarning = quote.riderEarning;
  }

  // ---- Promo code (re-validated server-side) ------------------------
  // We never trust the client's discountAmount — we recompute it
  // against the freshly-loaded PromoCode row so expiry / usage-cap
  // races can't be exploited. If the code is no longer valid the
  // order proceeds with discount 0 (more forgiving than failing the
  // whole order — the customer already saw the line item).
  let discountAmount = 0;
  let appliedPromoCode: string | null = null;
  if (promoCode) {
    const promo = await prisma.promoCode.findUnique({
      where: { code: promoCode },
    });
    if (
      promo &&
      promo.isActive &&
      (promo.expiresAt === null ||
        promo.expiresAt.getTime() > Date.now()) &&
      (promo.usageLimit === null || promo.usedCount < promo.usageLimit) &&
      (promo.minOrderAmount === null || subtotal >= promo.minOrderAmount) &&
      // Restaurant-scope check: a code scoped to a specific
      // restaurantId only applies if the cart is from that
      // restaurant. Platform-wide codes (restaurantId = null) match
      // anywhere. Mismatch silently drops the discount (more
      // forgiving than failing the whole order — the customer is
      // already at the payment step).
      (promo.restaurantId === null || promo.restaurantId === restaurant.id)
    ) {
      if (promo.discountType === "PERCENTAGE") {
        const pct = Math.min(Math.max(promo.discountValue, 0), 100);
        discountAmount = Math.floor((subtotal * pct) / 100);
        if (promo.maxDiscount !== null) {
          discountAmount = Math.min(discountAmount, promo.maxDiscount);
        }
      } else {
        discountAmount = promo.discountValue;
      }
      if (discountAmount > subtotal) discountAmount = Math.floor(subtotal);
      if (discountAmount < 0) discountAmount = 0;
      appliedPromoCode = promo.code;
    }
  }

  // Tax is computed on the post-discount subtotal so a 100% discount
  // doesn't leave the customer paying tax on what they didn't spend.
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const tax = Math.round(afterDiscount * 0.05);
  const total = afterDiscount + deliveryFee + tax;

  // ---- Persist ------------------------------------------------------
  try {
    const created = await prisma.order.create({
      data: {
        customerId: auth.user.id,
        restaurantId: restaurant.id,
        status: "PENDING",
        subtotal,
        deliveryFee,
        tax,
        total,
        deliveryAddress,
        // Snapshot the lat/lng + computed distance so a future
        // config change (or a restaurant re-pin) doesn't rewrite
        // historical orders. `null` is allowed — falls back to
        // the customer's typed address elsewhere.
        deliveryLat,
        deliveryLng,
        distanceKm,
        riderEarning,
        promoCode: appliedPromoCode,
        discountAmount,
        paymentMethod: paymentMethod as
          | "CASH"
          | "BKASH"
          | "NAGAD"
          | "CARD",
        // Feat 2 — optional customer note ("Ring the bell", etc.)
        specialInstructions,
        items: {
          create:
            orderItems as unknown as Prisma.OrderItemUncheckedCreateWithoutOrderInput[],
        },
      },
      include: {
        items: { include: { menuItem: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        restaurant: {
          select: { id: true, name: true, address: true, ownerId: true },
        },
      },
    });

    // Notify the partner that a new order came in. We fire-and-await
    // so the trigger row is durable before the API returns — if a
    // user reloads their dashboard immediately after placing the
    // order, the bell badge will already show 1.
    await createNotification(created.restaurant.ownerId, {
      title: "New order received",
      message: `${created.customer.name} ordered ${orderItems.length} item${orderItems.length === 1 ? "" : "s"} for ৳${total}.`,
      type: "ORDER_UPDATE",
      relatedOrderId: created.id,
    });

    // Bump the promo code's usedCount atomically. We do this after
    // the order is durably saved so a crash here doesn't strand the
    // counter; the next /validate call will still fail safely
    // because the in-memory check against the cap is informational.
    if (appliedPromoCode) {
      await prisma.promoCode.update({
        where: { code: appliedPromoCode },
        data: { usedCount: { increment: 1 } },
      });
    }

    return NextResponse.json(
      { order: formatOrderResponse(created) },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to place order" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/orders
 *
 * Role-aware list of orders.
 *
 *   • CUSTOMER — orders where customerId = self.
 *   • PARTNER  — orders where restaurantId = any restaurant owned by self.
 *                (Partner can have at most one restaurant in this MVP.)
 *   • RIDER    — orders where riderId = self OR (status = READY AND
 *                riderId IS NULL). The "riderId = self" branch covers
 *                the new dispatch-on-accept flow (PREPARING with the
 *                rider's id stamped, all the way through DELIVERED).
 *                The "READY, unassigned" branch is the legacy pool
 *                mode kept for backward-compat — no new orders land
 *                there because dispatch now runs on accept.
 *
 *   • Responses:
 *       200 { orders: OrderApi[] }
 *       401 missing / invalid token
 *       500 server error
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let rows;
    if (auth.user.role === "CUSTOMER") {
      rows = await prisma.order.findMany({
        where: { customerId: auth.user.id },
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { menuItem: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          restaurant: {
            select: { id: true, name: true, address: true },
          },
          rider: { select: { id: true, name: true, phone: true } },
        },
      });
    } else if (auth.user.role === "PARTNER") {
      // The partner's orders are scoped to their own restaurant.
      // First find the partner's restaurant (0 or 1 row).
      const restaurant = await prisma.restaurant.findFirst({
        where: { ownerId: auth.user.id },
        select: { id: true },
      });
      // ধাপ ৩ — a gateway order that was never paid (customer
      // abandoned the SSLCommerz page) must not appear in the
      // kitchen queue. COD orders are always visible; every other
      // method only once the gateway confirmed PAID.
      rows = restaurant
        ? await prisma.order.findMany({
            where: {
              restaurantId: restaurant.id,
              ...SETTLED_PAYMENT_FILTER,
            },
            orderBy: { createdAt: "desc" },
            include: {
              items: { include: { menuItem: true } },
              customer: { select: { id: true, name: true, email: true, phone: true } },
              restaurant: {
                select: { id: true, name: true, address: true },
              },
              rider: { select: { id: true, name: true, phone: true } },
            },
          })
        : [];
    } else {
      // RIDER — assigned to me + unassigned READY orders for the pool.
      // ধাপ ৩ — same paid-only rule as the partner branch: an unpaid
      // ghost order must never be offered to a rider. Spread the
      // settled-payment OR into both pool branches so an order that
      // is BOTH assigned-to-me AND unpaid is still hidden.
      rows = await prisma.order.findMany({
        where: {
          AND: [
            SETTLED_PAYMENT_FILTER,
            {
              OR: [
                // "My active deliveries" — the rider is the assigned
                // rider. Covers the new dispatch-on-accept flow
                // (riderId stamped at PREPARING) and every later
                // state (READY waiting for "Receive", PICKED_UP,
                // ON_THE_WAY, DELIVERED).
                { riderId: auth.user.id },
                // Legacy READY-pool mode (old behaviour, kept for
                // backward-compat). No new orders will land here
                // because the partner PATCH `preparing → ready` no
                // longer triggers the dispatch fan-out.
                { status: "READY", riderId: null },
              ],
            },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { menuItem: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          restaurant: {
            select: { id: true, name: true, address: true },
          },
          rider: { select: { id: true, name: true, phone: true } },
        },
      });
    }
    return NextResponse.json(
      { orders: rows.map(formatOrderResponse) },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load orders" },
      { status: 500 },
    );
  }
}
