"use client";

// lib/useGeocoding.ts
//
// Browser-only helpers + a small custom hook that centralises the
// Nomination search / reverse-geocode / geolocation logic so the
// address picker, the rider zone picker and any future picker can
// share the exact same code path.
//
// Two surfaces are exported:
//
//   1. Pure helpers (`formatLatLng`, `geolocate`) — easy to call
//      from event handlers without the hook overhead.
//
//   2. `useGeocoding` — a React hook that owns the search box
//      state (debounced Nominatim query, AbortController,
//      result list, loading flag) and the "use my location" state
//      (permission / availability / accuracy). The hook is pure
//      data — no JSX — so consumers can render the UI however
//      they like (modal, sheet, inline form, etc.).
//
// We intentionally re-use the existing helpers in
// `@/lib/map/nominatim` for the actual HTTP calls; this module
// just wires them together with React state, in-flight abort
// handling, a tiny in-memory cache and the Nominatim usage
// policy (`1 request / second` is respected by throttling the
// cache layer).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  reverseGeocode,
  searchAddress,
  type NominatimSuggestion,
} from "@/lib/map/nominatim";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** Geolocation options — `enableHighAccuracy` is on so a mobile
 *  rider with GPS gets a tight fix. `timeout: 10000` (10s) keeps
 *  the UI responsive even on a slow desktop wifi. `maximumAge: 0`
 *  means we never silently serve a cached position from a previous
 *  session. */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

/** Reverse-geocoded addresses from Nominatim are long; this is
 *  the heuristic we use to derive a compact "area, district"
 *  summary shown in the suggestion dropdown. We fall back to a
 *  generic name when Nominatim only returns a bare suburb. */
function summariseSuggestion(s: NominatimSuggestion): string {
  const a = s.address ?? {};
  const parts = [
    a.suburb ?? a.neighbourhood ?? a.village ?? a.town ?? "",
    a.city ?? a.state ?? "",
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  // Fallback: take the first two comma-separated chunks of the
  // full display_name (which is too verbose to show in the row).
  return s.displayName.split(",").slice(0, 2).join(",").trim();
}

/** "Lat 23.7104, Lng 90.4074" — the address field's fallback when
 *  reverse geocoding fails or returns empty. Keeps the user from
 *  getting an empty string in the form. */
export function formatLatLng(lat: number, lng: number): string {
  return `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
}

/* -------------------------------------------------------------------------- */
/*  Tiny in-memory cache (per-tab, per-query)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Caches forward-geocode results so a user typing the same query
 * twice doesn't fire two requests. Nominatim's usage policy
 * caps browsers at 1 request/second and any duplicate bursts
 * get our IP flagged — this is the cheapest way to stay under
 * the limit without a full debounce stack.
 */
const forwardCache = new Map<string, NominatimSuggestion[]>();
/** Timestamp of the last *outgoing* forward-geocode request. We
 *  block until at least 1100ms have elapsed since the previous
 *  one — Nominatim's policy is "absolute maximum 1 req/s". */
let lastForwardCallAt = 0;
const MIN_FORWARD_INTERVAL_MS = 1100;

async function cachedSearch(
  query: string,
  signal: AbortSignal,
): Promise<NominatimSuggestion[]> {
  const key = query.trim().toLowerCase();
  if (forwardCache.has(key)) {
    return forwardCache.get(key)!;
  }
  const wait = Math.max(0, lastForwardCallAt + MIN_FORWARD_INTERVAL_MS - Date.now());
  if (wait > 0) {
    await new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, wait);
      // If the caller aborts while we are waiting for the rate
      // limit, jump out immediately rather than firing the
      // request.
      signal.addEventListener("abort", () => window.clearTimeout(t), { once: true });
    });
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }
  const results = await searchAddress(query, { signal });
  forwardCache.set(key, results);
  lastForwardCallAt = Date.now();
  return results;
}

/* -------------------------------------------------------------------------- */
/*  Browser feature detection                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Some headless browsers (and a few older mobile WebViews) ship
 * without `navigator.geolocation`. We hide the "Use my current
 * location" button on those platforms and fall back to search +
 * map click — the rest of the flow keeps working.
 */
export function isGeolocationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "geolocation" in navigator
  );
}

/* -------------------------------------------------------------------------- */
/*  Geolocation helpers                                                       */
/* -------------------------------------------------------------------------- */

export type GeolocationErrorCode =
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNSUPPORTED";

/** English-only copy for the four geolocation error codes. We
 *  intentionally keep this in one place so the picker UIs never
 *  have to translate the numeric error code themselves. */
export function geolocationErrorMessage(code: GeolocationErrorCode): string {
  switch (code) {
    case "PERMISSION_DENIED":
      return "Location permission was blocked. Allow location access in your browser settings, or search for your area below.";
    case "POSITION_UNAVAILABLE":
      return "Could not determine your location. Search for your area or drop the pin on the map.";
    case "TIMEOUT":
      return "Locating took too long. Try again or search for your area.";
    case "UNSUPPORTED":
      return "Geolocation is not supported in this browser. Use search or drop the pin on the map.";
  }
}

/** Read the current GPS position. Throws a typed error so callers
 *  can map to the UI copy without touching the raw
 *  `GeolocationPositionError`. */
export function geolocate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      const err = new Error(geolocationErrorMessage("UNSUPPORTED"));
      (err as Error & { code: GeolocationErrorCode }).code = "UNSUPPORTED";
      reject(err);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        let code: GeolocationErrorCode = "POSITION_UNAVAILABLE";
        if (err.code === err.PERMISSION_DENIED) code = "PERMISSION_DENIED";
        else if (err.code === err.TIMEOUT) code = "TIMEOUT";
        else if (err.code === err.POSITION_UNAVAILABLE) code = "POSITION_UNAVAILABLE";
        const e = new Error(geolocationErrorMessage(code)) as Error & {
          code: GeolocationErrorCode;
        };
        e.code = code;
        reject(e);
      },
      GEOLOCATION_OPTIONS,
    );
  });
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export type UseGeocodingOptions = {
  /**
   * When true, the hook fires its first search as soon as the
   * consumer mounts. Mostly useful for the address picker where
   * we want to surface a few popular places the moment the user
   * opens the map. The zone picker leaves this off.
   */
  initialQuery?: string;
  /** Trim query length below this and the hook refuses to
   *  search. Default 2 (Nominatim has noisy results for shorter
   *  strings). */
  minQueryLength?: number;
  /** Debounce window (ms) between the last keystroke and the
   *  outgoing request. Default 500ms. */
  debounceMs?: number;
  /** Cap on visible suggestions in the dropdown. Default 6. */
  limit?: number;
};

export type UseGeocodingResult = {
  query: string;
  setQuery: (q: string) => void;

  suggestions: Array<{
    osmId: number;
    name: string; // short label (first chunk)
    summary: string; // "Area, District"
    displayName: string; // full Nominatim display_name
    lat: number;
    lng: number;
  }>;
  searching: boolean;

  /** Status of the "use my current location" button. */
  geolocating: boolean;
  geoError: string | null;
  geoSupported: boolean;

  /** Read the current GPS fix. Resolves with `{ lat, lng,
   *  accuracyMeters, approximate }`. `approximate` is true when
   *  the browser reports an accuracy > 500m — i.e. an IP-derived
   *  desktop fix — and the UI should warn the rider. */
  detectLocation: () => Promise<{
    lat: number;
    lng: number;
    accuracyMeters: number;
    approximate: boolean;
  } | null>;

  /** Resolve a lat/lng into a reverse-geocoded display name.
   *  Returns the formatted address on success, or a `formatLatLng`
   *  fallback when Nominatim has no record for that point. */
  reverseLookup: (
    lat: number,
    lng: number,
  ) => Promise<{ displayName: string; area?: string; city?: string }>;
};

/**
 * Wire the address-search and geolocation state for any Leaflet-
 * based picker.
 *
 * The hook is headless: it does not render anything, it just
 * exposes state + a small action surface. This lets the
 * `RiderZonePicker` and `AddressPicker` (and any future picker)
 * share one implementation while keeping their own visual
 * layouts.
 */
export function useGeocoding(
  options: UseGeocodingOptions = {},
): UseGeocodingResult {
  const { initialQuery = "", minQueryLength = 2, debounceMs = 500, limit = 6 } =
    options;

  const [query, setQuery] = useState(initialQuery);
  const [rawSuggestions, setRawSuggestions] = useState<NominatimSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Track the most recent in-flight search so we never apply
  // out-of-order responses.
  const searchSeq = useRef(0);

  // `isGeolocationSupported` is constant for the lifetime of the
  // document; we still wrap it in state so the initial render
  // (which runs server-side) reports `false`, then upgrades on
  // hydration to the real value.
  const geoSupported = useMemo(() => isGeolocationSupported(), []);

  /* ----------------------- search ------------------------------ */

  useEffect(() => {
    const q = query.trim();
    if (q.length < minQueryLength) {
      setRawSuggestions([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const ctrl = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const results = await cachedSearch(q, ctrl.signal);
        if (seq !== searchSeq.current) return;
        setRawSuggestions(results.slice(0, limit));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (seq !== searchSeq.current) return;
        setRawSuggestions([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, debounceMs);
    return () => {
      ctrl.abort();
      window.clearTimeout(handle);
    };
  }, [query, minQueryLength, debounceMs, limit]);

  const suggestions = useMemo(
    () =>
      rawSuggestions.map((s) => {
        const [first] = s.displayName.split(",");
        return {
          osmId: s.osmId,
          name: (first ?? "").trim() || s.displayName,
          summary: summariseSuggestion(s),
          displayName: s.displayName,
          lat: s.lat,
          lng: s.lng,
        };
      }),
    [rawSuggestions],
  );

  /* ----------------------- geolocation ------------------------- */

  const detectLocation = useCallback(async () => {
    setGeoError(null);
    setGeolocating(true);
    try {
      const pos = await geolocate();
      const accuracyMeters = pos.coords.accuracy;
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters,
        approximate: accuracyMeters > 500,
      };
    } catch (err) {
      setGeoError(
        err instanceof Error ? err.message : geolocationErrorMessage("POSITION_UNAVAILABLE"),
      );
      return null;
    } finally {
      setGeolocating(false);
    }
  }, []);

  const reverseLookup = useCallback(
    async (lat: number, lng: number) => {
      try {
        const r = await reverseGeocode(lat, lng);
        if (!r) {
          return { displayName: formatLatLng(lat, lng) };
        }
        return {
          displayName: r.displayName || formatLatLng(lat, lng),
          area: r.area,
          city: r.city,
        };
      } catch {
        return { displayName: formatLatLng(lat, lng) };
      }
    },
    [],
  );

  return {
    query,
    setQuery,
    suggestions,
    searching,
    geolocating,
    geoError,
    geoSupported,
    detectLocation,
    reverseLookup,
  };
}
