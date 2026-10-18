import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadActiveDeliveryFeeConfig, quoteDelivery } from "@/lib/delivery-fee";

/**
 * GET /api/delivery-fee/estimate
 *
 * Public estimate of the delivery fee for a restaurant from a
 * chosen location. Used by the checkout summary tile and the
 * customer-side restaurant card so the displayed fee tracks the
 * platform config instead of `restaurant.deliveryFee`.
 *
 * Query:
 *   restaurantId — required, string
 *   lat          — optional, number (-90..90)
 *   lng          — optional, number (-180..180)
 *
 * Responses:
 *   200 { fee: number, riderEarning: number, distanceKm: number|null,
 *         formatted: "৳35", fromBase: number, formattedBase: "৳30" }
 *   400 missing/invalid inputs
 *   404 restaurant unknown
 *   500 server error
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const restaurantId = searchParams.get("restaurantId");
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required" },
      { status: 400 },
    );
  }
  const lat =
    latRaw !== null && latRaw !== "" && !Number.isNaN(Number(latRaw))
      ? Number(latRaw)
      : null;
  const lng =
    lngRaw !== null && lngRaw !== "" && !Number.isNaN(Number(lngRaw))
      ? Number(lngRaw)
      : null;

  if (lat !== null && (lat < -90 || lat > 90)) {
    return NextResponse.json(
      { error: "lat must be between -90 and 90" },
      { status: 400 },
    );
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    return NextResponse.json(
      { error: "lng must be between -180 and 180" },
      { status: 400 },
    );
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: {
      id: restaurantId,
      // ধাপ ৪ — refuse to estimate a fee against a restaurant the
      // customer can't order from (PENDING/REJECTED). Without this
      // guard the checkout would happily show a fee and only fail
      // at /api/orders, which is a worse experience.
      deletedAt: null,
      verificationStatus: "APPROVED",
      isSuspended: false,
    },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const cfg = await loadActiveDeliveryFeeConfig();
  let fee = cfg.baseFee;
  let riderEarning = Math.round((fee * cfg.riderSharePercent) / 100);
  let distanceKm: number | null = null;

  if (
    lat !== null &&
    lng !== null &&
    typeof restaurant.latitude === "number" &&
    typeof restaurant.longitude === "number"
  ) {
    const q = quoteDelivery(
      cfg,
      restaurant.latitude,
      restaurant.longitude,
      lat,
      lng,
    );
    distanceKm = q.distanceKm;
    fee = q.fee;
    riderEarning = q.riderEarning;
  }

  return NextResponse.json(
    {
      fee,
      riderEarning,
      distanceKm,
      formatted: `৳${fee}`,
      fromBase: cfg.baseFee,
      formattedBase: `from ৳${cfg.baseFee}`,
    },
    { status: 200 },
  );
}
