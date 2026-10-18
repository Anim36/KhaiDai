import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PromoCode } from "@prisma/client";

/**
 * GET /api/promo-codes/active
 *
 * Public — returns every currently-redeemable promo code, used by
 * both the homepage "Promo / Offers" carousel and the dedicated
 * /offers landing page.
 *
 * Filter: same as `/api/promo-codes/validate` — active, not expired,
 * under the usage cap. Applied at the table level where possible so
 * the carousel/landing page never has to drop a row client-side.
 *
 * Partner-scoped codes (restaurantId != null) are also returned here.
 * The `/offers` page surfaces them with the restaurant's name so the
 * user can tell at a glance that a code is "only at Kacchi Bhai".
 *
 * Response: 200 { promos: ActivePromo[] }
 *   ActivePromo {
 *     id, code, discountType, discountValue, maxDiscount,
 *     minOrderAmount, expiresAt, usageLimit, usedCount,
 *     description, imageUrl,
 *     restaurantId, restaurantName
 *   }
 *
 * The `description` is a precomputed, human-readable Bengali/English
 * phrase ("৳50 ছাড়", "১০% পর্যন্ত ৳100 ছাড়", …) so the carousel can
 * render without re-implementing the discount-as-string logic.
 *
 * The carousel hides itself entirely when this returns `[]`, so a
 * transient Prisma failure (200 with `promos: []`) is preferable to
 * 5xx-ing the homepage.
 */
export async function GET() {
  try {
    const now = new Date();

    // Two-step fetch: pull the rows Postgres can cheap-filter on
    // (isActive, expiry), then drop the usage-cap ones in JS. The
    // JS hop is fine because the active set is tiny (handful of
    // codes at any time) and the JS check uses the same `getTime()`
    // comparison the validate route uses. We also include the
    // restaurant name for partner-scoped codes so the /offers page
    // can show "Only at <restaurant>".
    const candidates = await prisma.promoCode.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      include: {
        restaurant: {
          select: { id: true, name: true },
        },
      },
    });

    const promos = candidates
      .filter(
        (p) => p.usageLimit === null || p.usedCount < p.usageLimit,
      )
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        code: p.code,
        discountType: p.discountType,
        discountValue: p.discountValue,
        maxDiscount: p.maxDiscount,
        minOrderAmount: p.minOrderAmount,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        usageLimit: p.usageLimit,
        usedCount: p.usedCount,
        description: describeDiscount(p),
        imageUrl: p.imageUrl,
        restaurantId: p.restaurantId,
        restaurantName: p.restaurant?.name ?? null,
      }));

    return NextResponse.json({ promos }, { status: 200 });
  } catch (err) {
    // The homepage renders the section conditionally on this list
    // being non-empty, so a transient failure is best handled by
    // returning an empty payload rather than 5xx-ing.
    return NextResponse.json(
      {
        promos: [],
        error: err instanceof Error ? err.message : "Failed",
      },
      { status: 200 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * "৳50 ছাড়" / "১০% পর্যন্ত ৳100 ছাড়" / "৳30 ছাড় (min ৳200)".
 *
 * Bengali-first copy matches the rest of the customer-facing UI; if
 * a future locale switch is added we just key this off the user's
 * stored preference.
 */
function describeDiscount(
  p: Pick<
    PromoCode,
    | "discountType"
    | "discountValue"
    | "maxDiscount"
    | "minOrderAmount"
  >,
): string {
  if (p.discountType === "FIXED") {
    const base = `৳${p.discountValue} ছাড়`;
    return p.minOrderAmount !== null
      ? `${base} (min ৳${p.minOrderAmount})`
      : base;
  }
  // PERCENTAGE
  if (p.maxDiscount !== null) {
    return `৳${p.maxDiscount} পর্যন্ত ${p.discountValue}% ছাড়`;
  }
  return `${p.discountValue}% পর্যন্ত ছাড়`;
}
