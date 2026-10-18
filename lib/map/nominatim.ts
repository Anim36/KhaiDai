// lib/map/nominatim.ts — thin OpenStreetMap Nominatim client.
//
//   Nominatim's Usage Policy requires every browser-side request to
//   carry an identifying User-Agent header (otherwise they rate-limit
//   to a single shared IP-level quota). We pass that header here from
//   a single, browser-safe constant so every consumer stays in sync.
//   https://operations.osmfoundation.org/policies/nominatim/

export const NOMINATIM_USER_AGENT =
  "KhaiDai/1.0 (https://khaidai.local; contact@khaidai.local)";

export const DHAKA_CENTER = { lat: 23.8103, lng: 90.4125 } as const;

const SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

export type NominatimSuggestion = {
  /** Stable OSM id — useful as a `key` and for de-duplicating. */
  osmId: number;
  /** Free-text address shown in the dropdown. */
  displayName: string;
  lat: number;
  lng: number;
  /** Narrow bounding box — Nominatim returns it as strings. */
  bbox?: [number, number, number, number] | null;
  /** Coarse type ("city", "suburb", "road", …). */
  type?: string;
  /** Convenience: best-effort city/area fields. */
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    state?: string;
    country?: string;
  };
};

export type ReverseResult = {
  displayName: string;
  lat: number;
  lng: number;
  city?: string;
  area?: string;
  country?: string;
};

type RawSearchHit = {
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
  type?: string;
  address?: NominatimSuggestion["address"];
};

type RawReverseHit = {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    state?: string;
    country?: string;
  };
};

function withRequiredHeaders(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      Accept: "application/json",
      // Nominatim requires *some* identifying header from a browser;
      // browsers forbid setting `User-Agent`, but Nominatim accepts
      // an `X-App-Identifier`-style header as a stand-in.
      "X-App-Identifier": NOMINATIM_USER_AGENT,
      ...(init.headers ?? {}),
    },
  };
}

/**
 * Forward-geocode a free-text query. We bias the search to
 * Bangladesh (`countrycodes=bd`) but no longer pin it to a
 * Dhaka-only viewbox — earlier versions used `bounded=1` with a
 * Dhaka rectangle, which silently returned empty results for
 * Chittagong / Sylhet / Rajshahi. With `bounded` removed the
 * results are country-scoped but order is still distance-aware
 * because `viewbox` biases toward Dhaka when applicable.
 */
export async function searchAddress(
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<NominatimSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(options.limit ?? 6));
  url.searchParams.set("countrycodes", "bd");
  // Bias results toward the Bangladesh rectangle without forcing
  // them to live inside it. We use a wide viewbox that covers the
  // whole country, not just Dhaka, so any district surfaces.
  const viewbox = "88.0,20.5,92.5,26.5"; // [W,S,E,N] Bangladesh bbox
  url.searchParams.set("viewbox", viewbox);

  const res = await fetch(url.toString(), {
    ...withRequiredHeaders(),
    method: "GET",
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`Address search failed (${res.status})`);
  }
  const hits = (await res.json()) as RawSearchHit[];
  return hits.map((h) => ({
    osmId: h.osm_id,
    displayName: h.display_name,
    lat: Number(h.lat),
    lng: Number(h.lon),
    bbox: h.boundingbox
      ? [
          Number(h.boundingbox[0]),
          Number(h.boundingbox[1]),
          Number(h.boundingbox[2]),
          Number(h.boundingbox[3]),
        ]
      : null,
    type: h.type,
    address: h.address,
  }));
}

/**
 * Reverse-geocode a lat/lng pair into a human-readable address.
 * Returns `null` when Nominatim has no record for the pin (common
 * over water or far outside the city).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  options: { signal?: AbortSignal } = {},
): Promise<ReverseResult | null> {
  const url = new URL(REVERSE_ENDPOINT);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  const res = await fetch(url.toString(), {
    ...withRequiredHeaders(),
    method: "GET",
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`Reverse geocode failed (${res.status})`);
  }
  const raw = (await res.json()) as RawReverseHit | { error?: string };
  if ("error" in raw && raw.error) return null;
  const hit = raw as RawReverseHit;
  return {
    displayName: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    city:
      hit.address?.city ??
      hit.address?.town ??
      hit.address?.village ??
      hit.address?.state,
    area: hit.address?.suburb ?? hit.address?.neighbourhood,
    country: hit.address?.country,
  };
}
