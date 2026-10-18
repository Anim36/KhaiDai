import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readBearerToken } from "@/lib/auth";

/**
 * POST /api/promo-codes/validate
 *
 * Body:
 *   {
 *     code:           string  (required, will be uppercased)
 *     orderSubtotal:  number  (required, Taka)
 *     restaurantId?:  string  (required when validating a code that's
 *                              scoped to a specific restaurant)
 *   }
 *
 * Validates a promo code against the database (active, not expired,
 * usage-cap not exceeded, min-order satisfied, restaurant-scope match)
 * and returns the calculated discount amount. Order placement
 * (POST /api/orders) re-runs the same calculation server-side so a
 * stale response here can't bypass expiry between validate and place.
 *
 * Auth: optional — we accept guests (their carts don't carry a JWT)
 * because the call itself reveals only whether a code is valid and
 * how much it discounts, never any user data.
 *
 * Response 200:
 *   {
 *     code:           "WELCOME50",
 *     discountType:   "PERCENTAGE" | "FIXED",
 *     discountValue:  10,
 *     discountAmount: 50,        // calculated against orderSubtotal
 *     finalSubtotal:  950,       // subtotal - discountAmount (>=0)
 *     restaurantId:   null       // scope info (null = platform-wide)
 *   }
 *
 * Response 4xx:
 *   { error: <message> }
 */

type Body = {
  code?: unknown;
  orderSubtotal?: unknown;
  restaurantId?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    // Soft auth — we accept signed-out users too (some previews run
    // from a guest cart). We don't require a JWT but if one is
    // present we don't reject it either.
    readBearerToken(req);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const rawCode = typeof body.code === "string" ? body.code.trim() : "";
    if (rawCode.length === 0) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }
    if (rawCode.length > 64) {
      return NextResponse.json({ error: "Code too long" }, { status: 400 });
    }
    const code = rawCode.toUpperCase();
    const subtotal = Number(body.orderSubtotal);
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json(
        { error: "orderSubtotal must be a non-negative number" },
        { status: 400 },
      );
    }

    const promo = await prisma.promoCode.findUnique({ where: { code } });
    if (!promo) {
      return NextResponse.json(
        { error: "Invalid promo code" },
        { status: 404 },
      );
    }
    if (!promo.isActive) {
      return NextResponse.json(
        { error: "This code is no longer active" },
        { status: 400 },
      );
    }
    if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "This code has expired" },
        { status: 400 },
      );
    }
    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      return NextResponse.json(
        { error: "This code has reached its usage limit" },
        { status: 400 },
      );
    }
    if (promo.minOrderAmount !== null && subtotal < promo.minOrderAmount) {
      return NextResponse.json(
        {
          error: `Minimum order of ৳${promo.minOrderAmount} required`,
        },
        { status: 400 },
      );
    }

    // Restaurant-scope check. A code with `restaurantId` set only
    // applies when the caller's cart is for that same restaurant.
    // Platform-wide codes (restaurantId = NULL) match anywhere. The
    // cart's restaurantId is OPTIONAL on this endpoint (the checkout
    // page sends it; an exploratory validate from a banner click
    // might not) — if it's missing, scoped codes can't be confirmed
    // safe so we refuse them with a helpful message.
    const cartRestaurantId =
      typeof body.restaurantId === "string" && body.restaurantId.trim()
        ? body.restaurantId.trim()
        : null;
    if (promo.restaurantId !== null) {
      if (!cartRestaurantId) {
        return NextResponse.json(
          {
            error:
              "This code is only valid at a specific restaurant. Add items to your cart first.",
          },
          { status: 400 },
        );
      }
      if (promo.restaurantId !== cartRestaurantId) {
        return NextResponse.json(
          {
            error:
              "This code can only be used at its own restaurant. Try removing items from other restaurants first.",
          },
          { status: 400 },
        );
      }
    }

    // Compute the discount. PERCENTAGE applies the percentage of the
    // subtotal then caps at `maxDiscount` (if set). FIXED subtracts
    // the flat amount. The result is floored at the subtotal (can't
    // discount more than the order is worth).
    let discountAmount = 0;
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

    return NextResponse.json(
      {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discountAmount,
        finalSubtotal: Math.max(0, Math.floor(subtotal) - discountAmount),
        restaurantId: promo.restaurantId,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 },
    );
  }
}
