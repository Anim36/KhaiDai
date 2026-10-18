// lib/dispatch.ts
//
// Great-circle distance helper (haversine) + pickup logic that
// powers `/api/orders/[id]/dispatch`.

import { prisma } from "@/lib/prisma";
import { isEffectivelyOnline } from "@/lib/rider-presence";

/**
 * Haversine great-circle distance, kilometres. Used by the
 * dispatch logic to find the closest eligible rider for an order
 * and by the delivery-fee math.
 */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Default response window a rider has to Accept/Decline an offer
 * before the system considers the offer as timed out.
 */
export const RIDER_RESPONSE_WINDOW_MS = 45_000;

/**
 * Feat 1 — maximum number of active deliveries a single rider can
 * hold at the same time. Counts OFFERED_TO_RIDER (assigned to
 * them, not yet picked up) + PICKED_UP + ON_THE_WAY.
 */
export const MAX_CONCURRENT_DELIVERIES = 3;

/**
 * Read the dispatchedRiders JSON, defaulting to `{ riders: [] }`.
 */
export function readDispatchedRiders(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const riders = (raw as { riders?: unknown }).riders;
  if (!Array.isArray(riders)) return [];
  return riders.filter((r): r is string => typeof r === "string");
}

export type DispatchPickResult = {
  /** Newly-picked rider's user id, ready to be assigned to the order. */
  riderId: string | null;
  /** True when every online rider nearby has already been offered. */
  exhausted: boolean;
};

/**
 * Eligible rider shape — minimal columns the dispatcher needs to
 * reach a decision.
 */
type RiderCandidate = {
  userId: string;
  currentLat: number | null;
  currentLng: number | null;
  lastLocationUpdate: Date | null;
  zoneLat: number | null;
  zoneLng: number | null;
  zoneRadiusKm: number | null;
};

/**
 * Pick the next rider to offer this order to.
 *
 * A rider is **eligible** when ALL of the following hold:
 *
 *   • `isEffectivelyOnline(profile)` (see `lib/rider-presence`) —
 *     `isOnline === true` AND last location update within the
 *     freshness window (2 min). Stops stale "online" riders who
 *     closed their tab from being offered.
 *   • Service zone set AND the restaurant pin is inside it
 *     (haversine(restaurant, zoneCenter) ≤ zoneRadiusKm).
 *   • Has a known live location so we can rank by distance.
 *   • No active delivery on this rider.
 *   • Not in `excludeRiderIds`.
 *
 * Among eligible riders we pick the closest to the restaurant
 * (haversine(restaurant, currentRiderLocation)).
 *
 * If nobody is eligible the order stays in READY and the caller
 * emits a "No rider available" audit/notification. Riders whose
 * zones don't cover the restaurant are silently skipped — they
 * never get the offer.
 */
export async function pickNextRider(
  restaurantLat: number,
  restaurantLng: number,
  excludeRiderIds: string[],
): Promise<DispatchPickResult> {
  // Pull every rider who CLAIMS to be online + has a zone + has a
  // fresh-ish location. We do the radius / active-delivery
  // filters in code so we can read additional columns without
  // pushing non-trivial WHERE clauses through Prisma.
  //
  // ধাপ ৫ — exclude PENDING / REJECTED riders from dispatch
  // eligibility. Until an admin reviews their documents they
  // shouldn't be picking up deliveries, even if they manage to
  // flip the online toggle.
  const candidates: RiderCandidate[] = await prisma.riderProfile.findMany({
    where: {
      isOnline: true,
      verificationStatus: "APPROVED",
      currentLat: { not: null },
      currentLng: { not: null },
      zoneLat: { not: null },
      zoneLng: { not: null },
      lastLocationUpdate: { not: null },
      userId:
        excludeRiderIds.length > 0 ? { notIn: excludeRiderIds } : undefined,
    },
    select: {
      userId: true,
      currentLat: true,
      currentLng: true,
      lastLocationUpdate: true,
      zoneLat: true,
      zoneLng: true,
      zoneRadiusKm: true,
    },
  });

  if (candidates.length === 0) {
    return { riderId: null, exhausted: excludeRiderIds.length > 0 };
  }

  // Filter: zone covers the restaurant pin.
  const zoneFiltered = candidates.filter((r) => {
    if (
      r.currentLat === null ||
      r.currentLng === null ||
      r.zoneLat === null ||
      r.zoneLng === null
    ) {
      return false;
    }
    const radius = r.zoneRadiusKm ?? 5;
    const distToRestaurant = haversineKm(
      restaurantLat,
      restaurantLng,
      r.zoneLat,
      r.zoneLng,
    );
    return distToRestaurant <= radius;
  });

  if (zoneFiltered.length === 0) {
    return { riderId: null, exhausted: excludeRiderIds.length > 0 };
  }

  // Filter: effectively online (i.e. lastLocationUpdate is fresh).
  const fresh = zoneFiltered.filter((r) =>
    isEffectivelyOnline({
      isOnline: true,
      lastLocationUpdate: r.lastLocationUpdate,
    }),
  );

  if (fresh.length === 0) {
    return { riderId: null, exhausted: excludeRiderIds.length > 0 };
  }

  // Filter: rider has fewer than MAX_CONCURRENT_DELIVERIES active
  // orders. Previously this was a binary "no active delivery"
  // check — one rider = one delivery at a time. Per Feat 1, we now
  // allow up to 3 concurrent active deliveries so a single rider
  // can run a small batch (common during the lunch rush when
  // dispatch is starved).
  //
  // Active = any order currently OFFERED_TO_RIDER (assigned to
  // them and the rider hasn't declined) + PICKED_UP +
  // ON_THE_WAY. CANCELLED / DELIVERED / READY-not-yet-assigned
  // don't count.
  const activeOrders = await prisma.order.findMany({
    where: {
      riderId: { in: fresh.map((r) => r.userId) },
      status: {
        in: ["OFFERED_TO_RIDER", "PICKED_UP", "ON_THE_WAY"],
      },
    },
    select: { riderId: true },
  });
  const activeCountByRider = new Map<string, number>();
  for (const b of activeOrders) {
    if (!b.riderId) continue;
    activeCountByRider.set(
      b.riderId,
      (activeCountByRider.get(b.riderId) ?? 0) + 1,
    );
  }
  const active = fresh.filter(
    (r) =>
      (activeCountByRider.get(r.userId) ?? 0) < MAX_CONCURRENT_DELIVERIES,
  );
  if (active.length === 0) {
    return { riderId: null, exhausted: excludeRiderIds.length > 0 };
  }

  // Closest to restaurant wins.
  let best: { riderId: string; dist: number } | null = null;
  for (const r of active) {
    if (r.currentLat === null || r.currentLng === null) continue;
    const dist = haversineKm(
      restaurantLat,
      restaurantLng,
      r.currentLat,
      r.currentLng,
    );
    if (best === null || dist < best.dist) {
      best = { riderId: r.userId, dist };
    }
  }
  if (!best) return { riderId: null, exhausted: false };
  return { riderId: best.riderId, exhausted: false };
}

/**
 * Restaurant lat/lng accessor with a sensible fallback.
 */
export function restaurantCoords(restaurant: {
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
}): { lat: number; lng: number } | null {
  const lat =
    typeof restaurant.latitude === "number"
      ? restaurant.latitude
      : typeof restaurant.lat === "number"
        ? restaurant.lat
        : null;
  const lng =
    typeof restaurant.longitude === "number"
      ? restaurant.longitude
      : typeof restaurant.lng === "number"
        ? restaurant.lng
        : null;
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
