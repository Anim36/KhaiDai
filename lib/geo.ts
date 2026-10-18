// lib/geo.ts — geographic helpers.
//
// We do all our "how far is X from Y" math on Earth-surface WGS84
// coordinates using the Haversine formula. It assumes a perfectly
// spherical Earth, which is more than accurate enough for the
// ≤5 km delivery radius we care about (real error vs. Vincenty is
// well under 0.5 % over short distances).

const EARTH_RADIUS_KM = 6371.0088;

/** Convert degrees → radians. */
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two lat/lng pairs, in kilometres.
 * Inputs are validated defensively: anything non-finite is treated
 * as `NaN` so callers can `.filter(d => Number.isFinite(d))` before
 * sorting.
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return Number.NaN;
  }
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Pretty-print a distance for the listing card. Anything under 1 km
 * rounds up to "0.X km" so we don't end up with a chip that just
 * says "0 km".
 */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Lightweight Haversine distance helper for client code that
 * doesn't want to drag the dispatch logic + its `pg` driver
 * adapter import. Numerically identical to `haversineKm` in
 * `lib/dispatch.ts` (the same constants + the same algorithm),
 * kept here as the canonical client-safe entry point.
 */
export function haversineKmSimple(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  return calculateDistance(aLat, aLng, bLat, bLng);
}
