/**
 * Server-side helpers for road routing.
 *
 * We use the public OSRM demo endpoint at `https://router.project-osrm.org`
 * which exposes a no-API-key, no-auth `/route/v1/driving/{coords}` endpoint
 * returning a GeoJSON LineString plus total distance + duration.
 *
 * Trade-offs:
 *   • Demo server is rate-limited (~1 request/sec from the same IP) and
 *     best-effort uptime. Production should swap in a self-hosted OSRM
 *     or a paid alternative (Mapbox Directions, OpenRouteService).
 *   • 5s timeout — anything slower we treat as "no route" and fall back
 *     to a straight-line polylines.
 */

export type LatLng = { lat: number; lng: number };

export type RouteSummary = {
  /** Total route distance in meters. */
  distance: number;
  /** Total route duration in seconds. */
  duration: number;
  /** GeoJSON [lng, lat] pairs the map should draw. */
  geometry: LatLng[];
};

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TIMEOUT_MS = 5_000;

/**
 * Fetch a driving route from `from` to `to`. Returns null if the
 * server is unreachable, returns a non-OK status, or the route
 * "fell off the road network" (no path found).
 */
export async function fetchDrivingRoute(
  from: LatLng,
  to: LatLng,
): Promise<RouteSummary | null> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: Array<[number, number]> };
      }>;
    };
    if (body.code !== "Ok") return null;
    const route = body.routes?.[0];
    if (!route || !route.geometry?.coordinates) return null;
    const geometry: LatLng[] = route.geometry.coordinates
      .map(([lng, lat]) => ({ lat, lng }))
      .filter(
        (p): p is LatLng =>
          typeof p.lat === "number" &&
          typeof p.lng === "number" &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng),
      );
    return {
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
      geometry,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Haversine distance between two points in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
