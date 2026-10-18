import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import {
  ORDER_TRANSITIONS,
  canTransition,
  formatOrderResponse,
  isOrderStatusApi,
  orderStatusForDb,
} from "@/lib/orders";
import {
  RIDER_RESPONSE_WINDOW_MS,
  haversineKm,
  pickNextRider,
  readDispatchedRiders,
  restaurantCoords,
} from "@/lib/dispatch";
import {
  createNotification,
  notifyCustomerOrderUpdate,
} from "@/lib/notifications";
import { auditOrderStatusChange } from "@/lib/audit";
import {
  creditTokensForOrder,
  creditForOrderRefund,
  creditReferralBonusIfEligible,
} from "@/lib/wallet";
import { sendOrderReceiptEmail, type OrderReceiptInput } from "@/lib/mailer";

/**
 * GET /api/orders/[id]
 *
 * Returns a single order in the API shape. Access control:
 *
 *   • CUSTOMER — only their own order.
 *   • PARTNER  — only orders whose restaurant they own.
 *   • RIDER    — only orders assigned to them OR currently READY (so
 *                the rider can poll the "available pool" via the list
 *                endpoint too, but a direct GET on a specific id still
 *                works once they've accepted it).
 *
 *   • 200 { order: OrderApi }
 *   • 401 missing / invalid token
 *   • 403 not allowed to view this order
 *   • 404 unknown id
 *   • 500 server error
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const row = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: { include: { menuItem: true } },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            addresses: {
              select: { latitude: true, longitude: true },
              where: { isDefault: true },
              take: 1,
            },
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        rider: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    const allowed = await canViewOrder(auth.user, row);
    if (!allowed) {
      return NextResponse.json(
        { error: "You don't have access to this order" },
        { status: 403 },
      );
    }

    // Pull the rider's most recent location + the customer drop-off
    // pin so the tracking UI doesn't have to make a second round
    // trip. Privacy: rider coordinates are only returned when the
    // rider is online (the same gate the dispatch logic uses).
    const riderProfile = row.riderId
      ? await prisma.riderProfile.findUnique({
          where: { userId: row.riderId },
          select: {
            currentLat: true,
            currentLng: true,
            lastLocationUpdate: true,
            isOnline: true,
          },
        })
      : null;

    const riderLocation =
      riderProfile?.isOnline
        ? {
            lat: riderProfile.currentLat,
            lng: riderProfile.currentLng,
            lastUpdate: riderProfile.lastLocationUpdate?.toISOString() ?? null,
          }
        : null;

    const customerDropOff =
      row.customer?.addresses?.[0]?.latitude != null &&
      row.customer?.addresses?.[0]?.longitude != null
        ? {
            lat: row.customer.addresses[0].latitude as number,
            lng: row.customer.addresses[0].longitude as number,
          }
        : null;

    const restaurantLocation =
      row.restaurant?.latitude != null && row.restaurant?.longitude != null
        ? {
            lat: row.restaurant.latitude,
            lng: row.restaurant.longitude,
          }
        : null;

    return NextResponse.json(
      {
        order: formatOrderResponse(row),
        tracking: {
          riderLocation,
          customerDropOff,
          restaurantLocation,
          /** Whether the rider is currently online (privacy gate). */
          riderIsOnline: riderProfile?.isOnline ?? false,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load order" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/orders/[id]
 *
 * Update an order's status. Body:
 *   { status: "preparing" | "ready" | "picked_up" | "on_the_way" |
 *            "delivered" | "cancelled" }
 *
 * Role-based authorisation + transition validation:
 *
 *   • CUSTOMER — only their own order, and only `pending → cancelled`.
 *   • PARTNER  — only orders whose restaurant they own. Allowed
 *                transitions per the `ORDER_TRANSITIONS` matrix:
 *                PENDING → PREPARING, PENDING → CANCELLED,
 *                PREPARING → READY, PREPARING → CANCELLED.
 *   • RIDER    — only READY/PICKED_UP/ON_THE_WAY orders. Allowed
 *                transitions:
 *                READY → PICKED_UP (also assigns riderId),
 *                PICKED_UP → ON_THE_WAY,
 *                ON_THE_WAY → DELIVERED.
 *
 *   • 200 { order: OrderApi }
 *   • 400 invalid body / invalid transition
 *   • 401 missing / invalid token
 *   • 403 not allowed to mutate this order
 *   • 404 unknown id
 *   • 500 server error
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Order mutations are an in-portal action — CUSTOMER / PARTNER /
  // RIDER drive status transitions from their own dashboards.
  // ADMIN has its own surface (`/admin/*`) and isn't allowed to
  // mutate orders here. Without this gate ADMIN would otherwise
  // be a valid bearer that the downstream `canTransition` rejects
  // with a confusing "as a admin" message.
  if (auth.user.role === "ADMIN") {
    return NextResponse.json(
      { error: "Admins don't mutate orders here — use the admin panel." },
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
  const next = patch.status;
  if (!isOrderStatusApi(next)) {
    return NextResponse.json(
      { error: "status is required and must be a valid order status" },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: { include: { menuItem: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        restaurant: {
          select: { id: true, name: true, address: true },
        },
        rider: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    const allowed = await canViewOrder(auth.user, existing);
    if (!allowed) {
      return NextResponse.json(
        { error: "You don't have access to this order" },
        { status: 403 },
      );
    }

    const role = auth.user.role;
    const from = existing.status.toLowerCase() as
      | "pending"
      | "preparing"
      | "ready"
      | "offered_to_rider"
      | "picked_up"
      | "on_the_way"
      | "delivered"
      | "cancelled";

    // RIDER-specific guard: a rider can only "accept" a READY order
    // that has no rider assigned yet (legacy pool mode), and can only
    // "advance" an order that is already assigned to them. The new
    // dispatch-on-accept flow stamps riderId at PREPARING, so a rider
    // whose id is already stamped may only advance forward from
    // READY → PICKED_UP and beyond.
    if (role === "RIDER") {
      if (
        from === "ready" &&
        existing.riderId !== null &&
        existing.riderId !== auth.user.id
      ) {
        return NextResponse.json(
          { error: "This order is already assigned to another rider" },
          { status: 403 },
        );
      }
      if (from !== "ready" && existing.riderId !== auth.user.id) {
        return NextResponse.json(
          { error: "You can only update orders assigned to you" },
          { status: 403 },
        );
      }
    }

    // Bug 4 (defense-in-depth) — an already-completed status
    // transition is treated as a successful no-op rather than a
    // 400. This protects the rider "Receive" CTA from a race
    // where the rider taps twice (the second tap fires while the
    // server has just landed `picked_up`) and from polling-driven
    // duplicate PATCHes.
    //
    // Authorization still applies: the same actor must own the
    // row. We just don't insist on a state-machine edge from
    // `from` to `next` when they're equal — the row is already
    // there.
    if (from === next) {
      // Return the current row without re-writing it. The caller
      // gets a 200 so the UI treats the action as a success.
      const fresh = await prisma.order.findUnique({
        where: { id: params.id },
          include: {
            items: { include: { menuItem: true } },
            customer: {
              select: { id: true, name: true, email: true, phone: true },
            },
            restaurant: {
              select: {
                id: true,
                name: true,
                address: true,
                latitude: true,
                longitude: true,
              },
            },
            rider: { select: { id: true, name: true, phone: true } },
          },
        });
        if (!fresh) {
          return NextResponse.json(
            { error: "Order not found" },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { order: formatOrderResponse(fresh) },
          { status: 200 },
        );
    }

    if (!canTransition(role, from, next)) {
      return NextResponse.json(
        {
          error: `Cannot transition order from "${from}" to "${next}" as a ${role.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    // Build the update payload. When the rider picks up an OFFERED_TO_RIDER
    // or legacy-READY order we also stamp `riderId` so the assignment is
    // permanent. (When the rider declines an OFFER, we don't clear the
    // riderId here — the dispatch route is what re-runs ranking and
    // clears / re-stamps it.)
    const data: {
      status: ReturnType<typeof orderStatusForDb>;
      riderId?: string;
    } = { status: orderStatusForDb(next) };
    if (
      role === "RIDER" &&
      next === "picked_up" &&
      (from === "ready" || from === "offered_to_rider")
    ) {
      data.riderId = auth.user.id;
    }

    const updated = await prisma.order.update({
      where: { id: params.id },
      data,
      include: {
        items: { include: { menuItem: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        rider: { select: { id: true, name: true, phone: true } },
      },
    });
    void auditOrderStatusChange({
      userId: auth.user.id,
      orderId: updated.id,
      fromStatus: from.toUpperCase(),
      toStatus: updated.status,
      actorRole: role,
    });

    // Feat 4 — credit 8% of the order subtotal as loyalty tokens
    // when the order lands on DELIVERED. Server-trusted: the subtotal
    // comes from the freshly-loaded order row inside the same
    // transaction wrapper below. Idempotent — `creditTokensForOrder`
    // refuses to double-credit if a previous DELIVERED already
    // earned tokens for this orderId.
    if (next === "delivered" && updated.status === "DELIVERED") {
      const tokenAmount = Math.round(updated.subtotal * 0.08);
      if (tokenAmount > 0) {
        try {
          const profile = await prisma.customerProfile.findUnique({
            where: { userId: updated.customerId },
            select: { id: true },
          });
          if (profile) {
            await creditTokensForOrder(prisma, {
              customerProfileId: profile.id,
              orderId: updated.id,
              tokenAmount,
              description: `Loyalty tokens on delivered order #${updated.id.slice(-6).toUpperCase()}`,
            });
            void createNotification(updated.customerId, {
              title: "Loyalty tokens earned",
              message: `${tokenAmount} tokens added to your KhaiDai Wallet for completing order #${updated.id.slice(-6).toUpperCase()}.`,
              type: "ORDER_UPDATE",
              relatedOrderId: updated.id,
            });
          }
        } catch (e) {
          console.error("token credit failed", e);
        }
      }

      // Feat 3 — fire the post-delivery receipt email to the
      // customer. Wrapped in try/catch + a void so a transient
      // SMTP failure can never roll the order back. The `idempotent`
      // guarantee is implicit: a PATCH on an already-DELIVERED
      // order is rejected earlier in the request (status
      // transition matrix), so this block runs at most once per
      // order lifetime.
      try {
        if (updated.customer?.email) {
          const shortId = `#KD-${updated.id.slice(-4).toUpperCase()}`;
          const placedAt = new Date(updated.createdAt);
          const deliveredAt = new Date();
          const itemLines = updated.items.map((it) => {
            const opts = Array.isArray(it.selectedOptions)
              ? ((it.selectedOptions as Array<{
                  name?: string;
                  choiceLabels?: string[];
                }>) ?? [])
              : [];
            const optionsLabel = opts
              .flatMap((o) => o.choiceLabels ?? [])
              .filter((l) => typeof l === "string" && l.length > 0)
              .join(", ");
            return {
              name: it.menuItem?.name ?? "Item",
              qty: it.quantity,
              lineTotal: it.price * it.quantity,
              optionsLabel,
            };
          });
          const receipt: OrderReceiptInput = {
            shortId,
            restaurantName: updated.restaurant?.name ?? "KhaiDai partner",
            restaurantAddress: updated.restaurant?.address ?? "",
            customerName: updated.customer?.name ?? "",
            items: itemLines,
            subtotal: updated.subtotal,
            deliveryFee: updated.deliveryFee,
            tax: updated.tax,
            discountAmount: updated.discountAmount ?? 0,
            promoCode: updated.promoCode ?? null,
            total: updated.total,
            paymentMethod: updated.paymentMethod,
            deliveryAddress: updated.deliveryAddress,
            deliveredAtLabel: deliveredAt.toLocaleString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour12: true,
            }),
          };
          const result = await sendOrderReceiptEmail(
            updated.customer.email,
            receipt,
          );
          if (!result.ok) {
            console.warn(
              `[receipt] failed for order ${updated.id}:`,
              result.reason,
            );
          } else {
            // Suppress an unused-var lint on `placedAt` — kept
            // for future "ordered at …" copy in the email body.
            void placedAt;
          }
        }
      } catch (e) {
        console.error("[receipt] unexpected failure", e);
      }

      // Feat 6 — Customer Referral Program. When a referee's
      // first order lands on DELIVERED, credit both wallets
      // (referrer + referee) with the flat ৳50 bonus and flip
      // the Referral edge to REWARDED. Same try/catch + log
      // pattern as the token + email blocks above so a glitch
      // in the reward pipeline can never roll the order back.
      //
      // Idempotency: the (refereeUserId) is UNIQUE and the row
      // is updated from PENDING → REWARDED inside the same
      // transaction. If a second DELIVERED arrives (e.g. an
      // admin manually re-runs the transition) the `where:
      // { status: "PENDING" }` guard means updateMany returns
      // count = 0 and the bonus block silently skips.
      try {
        const rewardResult = await creditReferralBonusIfEligible(
          prisma,
          {
            refereeUserId: updated.customerId,
            relatedOrderId: updated.id,
          },
        );
        if (rewardResult.rewarded) {
          // Best-effort notifications. Don't roll back the
          // credit if the notification service is down.
          try {
            const recipientIds = new Set<string>();
            recipientIds.add(rewardResult.referrerUserId);
            recipientIds.add(rewardResult.refereeUserId);
            const noteTitles = new Map<string, string>();
            const noteBodies = new Map<string, string>();
            noteTitles.set(
              rewardResult.referrerUserId,
              "You earned ৳50 for referring a friend!",
            );
            noteBodies.set(
              rewardResult.referrerUserId,
              "Your friend just completed their first order. We've credited ৳50 to your KhaiDai Wallet as a thank-you.",
            );
            noteTitles.set(
              rewardResult.refereeUserId,
              "You earned ৳50 for joining with a referral code!",
            );
            noteBodies.set(
              rewardResult.refereeUserId,
              "Your first order was just delivered. We've credited ৳50 to your KhaiDai Wallet as a welcome bonus.",
            );
            for (const uid of recipientIds) {
              const existing = await prisma.notification.findFirst({
                where: {
                  userId: uid,
                  title: noteTitles.get(uid) ?? "",
                },
                select: { id: true },
              });
              if (existing) continue;
              await prisma.notification.create({
                data: {
                  userId: uid,
                  type: "PROMOTION",
                  title: noteTitles.get(uid) ?? "",
                  message: noteBodies.get(uid) ?? "",
                },
              });
            }
          } catch (e) {
            console.error(
              "[referral] notification failed",
              e,
            );
          }
        }
      } catch (e) {
        console.error("[referral] bonus credit failed", e);
      }
    }

    // Bug — Feat 3 (regression fix): when a partner / customer
    // transitions an order to CANCELLED through THIS endpoint (the
    // legacy PATCH path — e.g. from the Partner Dashboard's
    // OrdersPanel "Reject" button), a paid order must still refund
    // the customer's wallet. The refund logic was previously only
    // wired into the dedicated POST /api/orders/[id]/cancel route,
    // so any PATCH-driven cancellation (which is what the
    // dashboard uses) silently skipped the credit and the
    // customer saw "refund is processed automatically" on the
    // tracking page but received nothing in My Wallet.
    //
    // This block mirrors the cancel route's logic exactly, so
    // both code paths now produce the same outcome: PAID + non-COD
    // order → credit the customer's wallet by `order.total` and
    // write a WalletTransaction{type: 'REFUND'} row, inside an
    // atomic transaction so a partial write can never leave the
    // balance out of sync.
    if (next === "cancelled" && updated.status === "CANCELLED") {
      const isPaidRefund =
        updated.paymentMethod !== "CASH" &&
        updated.paymentGatewayStatus === "PAID";
      if (isPaidRefund) {
        try {
          await prisma.$transaction(async (tx) => {
            const profile = await tx.customerProfile.findUnique({
              where: { userId: updated.customerId },
              select: { id: true },
            });
            if (!profile) return;
            const r = await creditForOrderRefund(tx, {
              customerProfileId: profile.id,
              orderId: updated.id,
              amount: updated.total,
              description: `Refund for cancelled order #${updated.id.slice(-6).toUpperCase()}`,
            });
            // Only fire the customer notification when the credit
            // actually landed — mirrors the cancel route's behavior
            // so a customer without a profile (shouldn't happen in
            // practice) doesn't get a notification that the wallet
            // is empty.
            if (r.credited) {
              void createNotification(updated.customerId, {
                title: "Refund added to KhaiDai Wallet",
                message: `Your order was cancelled. ৳${updated.total.toLocaleString()} has been refunded to your KhaiDai Wallet.`,
                type: "ORDER_UPDATE",
                relatedOrderId: updated.id,
              });
            }
          });
        } catch (e) {
          // Surface the failure so it's never silent in the log,
          // but don't 500 the partner — the cancellation itself
          // already succeeded; a refund retry can be handled by
          // support.
          console.error(
            `[PATCH /api/orders/${updated.id}] refund credit failed`,
            e,
          );
        }
      }
    }

    // Auto-dispatch when the partner ACCEPTS the order (pending →
    // preparing). The new flow ships the offer to the nearest eligible
    // rider immediately; the order row stays at PREPARING while the
    // partner cooks, and the rider's dashboard renders it as
    // "Waiting for food" (see RiderDeliveryPage / RiderDashboardPage).
    //
    // We do this inline (not via HTTP round-trip) so a failed
    // dispatch never blocks the partner's "Accept" button — if
    // ranking fails we leave the order PREPARING with no riderId
    // and let the rider-availability poll / pending-offers feed
    // retry.
    if (
      role === "PARTNER" &&
      from === "pending" &&
      next === "preparing"
    ) {
      try {
        const coords = restaurantCoords(updated.restaurant);
        if (coords) {
          const pick = await pickNextRider(coords.lat, coords.lng, []);
          if (pick.riderId) {
            const deadline = new Date(
              Date.now() + RIDER_RESPONSE_WINDOW_MS,
            );
            // Feat 1 — dispatch-on-accept: keep the order's status
            // as PREPARING (don't flip to OFFERED_TO_RIDER) so the
            // rider's dashboard reads "Waiting for food" until the
            // partner "Mark Ready"s. The legacy OFFERED_TO_RIDER
            // branch is reserved for orders that came through the
            // pre-restructure `preparing → ready` flow.
            await prisma.order.update({
              where: { id: updated.id },
              data: {
                status: "PREPARING",
                riderId: pick.riderId,
                riderResponseDeadline: deadline,
                dispatchedRiders: { riders: [] },
              },
            });
            void readDispatchedRiders; // keep import alive (used by /dispatch)

            // Emit the rider bell notification inline so the offer
            // surfaces immediately — without this the rider only
            // sees the offer when they explicitly poll
            // /api/orders/pending-offers. The preference gate is
            // honoured here so a rider who turned "New delivery
            // request bell" off still gets the offer card + countdown
            // but no bell row.
            try {
              const riderProfile = await prisma.riderProfile.findUnique({
                where: { userId: pick.riderId },
                select: {
                  currentLat: true,
                  currentLng: true,
                  notifyNewRequest: true,
                },
              });
              if (riderProfile && riderProfile.notifyNewRequest !== false) {
                const pickupDistanceKm =
                  riderProfile.currentLat !== null &&
                  riderProfile.currentLng !== null
                    ? haversineKm(
                        coords.lat,
                        coords.lng,
                        riderProfile.currentLat,
                        riderProfile.currentLng,
                      )
                    : null;
                const segments = [
                  `New delivery offer from ${updated.restaurant.name}.`,
                  pickupDistanceKm !== null
                    ? `${pickupDistanceKm.toFixed(1)} km pickup`
                    : null,
                  typeof updated.riderEarning === "number"
                    ? `৳${updated.riderEarning} earning`
                    : null,
                ].filter((s): s is string => Boolean(s));
                await createNotification(pick.riderId, {
                  title: "New delivery offer",
                  message: `${segments.join(" — ")}. Tap to accept or decline.`,
                  type: "ORDER_UPDATE",
                  relatedOrderId: updated.id,
                });
              }
            } catch (notifErr) {
              console.error(
                "inline dispatch notification failed",
                notifErr,
              );
            }
          }
        }
      } catch (err) {
        console.error("auto-dispatch failed", err);
        // Don't fail the PATCH — the partner's "ready" action already
        // succeeded. Dispatch will retry on the next rider poll or
        // partner button click.
      }
    }

    // Re-fetch to include any dispatch-mutation we just made so the
    // response shape stays consistent for the caller.
    const final = await prisma.order.findUnique({
      where: { id: updated.id },
      include: {
        items: { include: { menuItem: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        restaurant: {
          select: { id: true, name: true, address: true },
        },
        rider: { select: { id: true, name: true, phone: true } },
      },
    });

    // Fire-and-await customer notification. The helper is a no-op
    // for transitions that don't have a customer-facing copy, so we
    // can always call it without a status whitelist.
    await notifyCustomerOrderUpdate({
      id: updated.id,
      customerId: updated.customerId,
      // `updated.status` is the DB enum (SCREAMING_SNAKE); the helper
      // lower-cases internally so we can pass it through verbatim.
      status: updated.status,
    });

    return NextResponse.json(
      { order: formatOrderResponse(final ?? updated) },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update order" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function canViewOrder(
  user: { id: string; role: "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN" },
  row: {
    customerId: string;
    restaurantId: string;
    riderId: string | null;
    status: string;
  },
): Promise<boolean> {
  // Admin sees everything — they're the platform moderation role.
  if (user.role === "ADMIN") return true;
  if (user.role === "CUSTOMER") {
    return row.customerId === user.id;
  }
  if (user.role === "PARTNER") {
    const owned = await prisma.restaurant.findFirst({
      where: { id: row.restaurantId, ownerId: user.id },
      select: { id: true },
    });
    return owned !== null;
  }
  // RIDER — own order, or unassigned READY order (the pool).
  if (row.riderId === user.id) return true;
  if (row.status === "READY" && row.riderId === null) return true;
  return false;
}
