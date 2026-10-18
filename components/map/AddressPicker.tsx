"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  DHAKA_CENTER,
  NominatimSuggestion,
  reverseGeocode,
  searchAddress,
} from "@/lib/map/nominatim";

/* -------------------------------------------------------------------------- */
/*  Marker icon — fix the well-known Next.js + Leaflet bug                    */
/* -------------------------------------------------------------------------- */

// In webpack/turbopack builds the bundler rewrites image URLs and Leaflet's
// default `iconRetinaUrl` ends up pointing at 404s. We rebuild the icon from
// `iconUrl` / `iconRetinaUrl` / `shadowUrl` using inline data URIs so the
// marker is always rendered, regardless of bundler or runtime.
const markerIcon = new L.Icon({
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 25 41' width='25' height='41'>
        <path d='M12.5 0C5.6 0 0 5.6 0 12.5 0 22.6 12.5 41 12.5 41S25 22.6 25 12.5C25 5.6 19.4 0 12.5 0z' fill='#EA1A4F'/>
        <circle cx='12.5' cy='12.5' r='5' fill='#fff'/>
      </svg>`,
    ),
  iconRetinaUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 25 41' width='25' height='41'>
        <path d='M12.5 0C5.6 0 0 5.6 0 12.5 0 22.6 12.5 41 12.5 41S25 22.6 25 12.5C25 5.6 19.4 0 12.5 0z' fill='#EA1A4F'/>
        <circle cx='12.5' cy='12.5' r='5' fill='#fff'/>
      </svg>`,
    ),
  shadowUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='41' height='41' viewBox='0 0 41 41'>
        <ellipse cx='12' cy='38' rx='9' ry='3' fill='rgba(0,0,0,0.25)'/>
      </svg>`,
    ),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type PickedAddress = {
  fullAddress: string;
  city: string;
  area?: string | null;
  latitude: number;
  longitude: number;
};

type Props = {
  /**
   * Optional seed — when the user re-opens the picker we drop the pin
   * on their last selection instead of the city default.
   */
  initial?: { latitude: number; longitude: number; fullAddress?: string } | null;
  /** Called when the user taps "Confirm Address". */
  onConfirm: (picked: PickedAddress) => void;
  /** Called when the user dismisses the picker without confirming. */
  onCancel?: () => void;
  /** Optional confirm button label override (e.g. "Use this address"). */
  confirmLabel?: string;
  className?: string;
};

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Wires the map's own click → reverse-geocode → pin move. Lives inside
 * `<MapContainer>` so it can use `useMapEvents` and `useMap` hooks.
 */
function ClickAndFlyHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Imperatively pans the map whenever the parent state changes (e.g. when the
 * user picks a suggestion and we want to fly to it).
 */
function FlyToController({ position }: { position: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 16), {
      duration: 0.6,
    });
  }, [map, position]);
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function AddressPicker({
  initial,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm Address",
  className,
}: Props) {
  // Seed from the initial pin, falling back to Dhaka. We hold this in
  // state (not a ref) so the marker rerenders cleanly when the parent
  // re-seeds the picker.
  const [position, setPosition] = useState<{
    lat: number;
    lng: number;
  }>(() =>
    initial
      ? { lat: initial.latitude, lng: initial.longitude }
      : { lat: DHAKA_CENTER.lat, lng: DHAKA_CENTER.lng },
  );
  const [resolvedAddress, setResolvedAddress] = useState<string>(
    initial?.fullAddress ?? "",
  );
  const [resolvedCity, setResolvedCity] = useState<string>("");
  const [resolvedArea, setResolvedArea] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [resolving, setResolving] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // Track the most-recent reverse-geocode request so an out-of-order
  // response can never overwrite a fresher pick.
  const reverseSeq = useRef(0);

  /* ----------------------- reverse geocode on pick ----------------------- */

  async function pickAt(lat: number, lng: number) {
    setPosition({ lat, lng });
    setShowSuggestions(false);
    setResolvedAddress("");
    setResolvedCity("");
    setResolvedArea("");
    setLocError(null);

    const seq = ++reverseSeq.current;
    setResolving(true);
    try {
      const result = await reverseGeocode(lat, lng);
      if (seq !== reverseSeq.current) return; // stale
      if (!result) {
        setResolvedAddress("Selected location");
        setResolvedCity("");
        return;
      }
      setResolvedAddress(result.displayName);
      setResolvedCity(result.city ?? "");
      setResolvedArea(result.area ?? "");
    } catch (err) {
      if (seq !== reverseSeq.current) return;
      setResolvedAddress("Selected location");
      setResolvedCity("");
      setLocError(
        err instanceof Error ? err.message : "Could not resolve address",
      );
    } finally {
      if (seq === reverseSeq.current) setResolving(false);
    }
  }

  /* ----------------------- debounced search ------------------------------ */

  // Debounce: 500ms after the user stops typing.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const results = await searchAddress(q, { signal: ctrl.signal });
        setSuggestions(results);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => {
      ctrl.abort();
      window.clearTimeout(handle);
    };
  }, [searchQuery]);

  function pickSuggestion(s: NominatimSuggestion) {
    setSearchQuery(s.displayName);
    setShowSuggestions(false);
    void pickAt(s.lat, s.lng);
  }

  /* ----------------------- "use my location" ----------------------------- */

  function useCurrentLocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocError("Geolocation is not supported in this browser.");
      return;
    }
    setGeolocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeolocating(false);
        void pickAt(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGeolocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "Permission denied. Please allow location access."
            : "Could not detect your location.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /* ----------------------- confirm --------------------------------------- */

  const canConfirm = useMemo(
    () => !resolving && position.lat !== 0 && position.lng !== 0,
    [resolving, position],
  );

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({
      fullAddress: resolvedAddress || "Selected location",
      city: resolvedCity || "Dhaka",
      area: resolvedArea || null,
      latitude: position.lat,
      longitude: position.lng,
    });
  }

  /* ---------------------------- render ----------------------------------- */

  return (
    <div
      className={
        "flex h-full w-full flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-card sm:p-5 " +
        (className ?? "")
      }
    >
      {/* Search + current location */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search address or place…"
            className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            aria-label="Search address"
          />
          {showSuggestions &&
          (suggestions.length > 0 || searching || searchQuery.trim().length >= 3) ? (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-12 z-[1100] max-h-64 overflow-y-auto rounded-xl border border-line bg-white shadow-card"
            >
              {searching ? (
                <li className="px-4 py-2 text-[13px] text-ink-muted">Searching…</li>
              ) : suggestions.length === 0 ? (
                <li className="px-4 py-2 text-[13px] text-ink-muted">
                  No matches. Try a different phrase.
                </li>
              ) : (
                suggestions.map((s) => (
                  <li
                    key={s.osmId}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => {
                      // mouseDown so the click lands before the input's blur
                      e.preventDefault();
                      pickSuggestion(s);
                    }}
                    className="cursor-pointer border-b border-line/60 px-4 py-2 text-[13px] text-ink last:border-b-0 hover:bg-surface-soft"
                  >
                    {s.displayName}
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={geolocating}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {geolocating ? "Detecting…" : "Use my current location"}
        </button>
      </div>

      {/* Map */}
      <div className="relative h-[320px] w-full overflow-hidden rounded-2xl border border-line bg-surface-soft sm:h-[420px]">
        <MapContainer
          center={[position.lat, position.lng]}
          zoom={15}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: "#eef2f7" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickAndFlyHandler onPick={pickAt} />
          <FlyToController position={position} />
          <Marker position={[position.lat, position.lng]} icon={markerIcon} draggable eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const ll = m.getLatLng();
              void pickAt(ll.lat, ll.lng);
            },
          }} />
        </MapContainer>
      </div>

      {/* Resolved address + confirm */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Selected address
          </p>
          <p className="mt-1 line-clamp-2 text-[14px] font-medium text-ink">
            {resolving
              ? "Resolving address…"
              : resolvedAddress || "Tap on the map or search to pick a location"}
          </p>
          {resolvedCity ? (
            <p className="text-[12px] text-ink-muted">
              {[resolvedArea, resolvedCity].filter(Boolean).join(", ")}
            </p>
          ) : null}
          {locError ? (
            <p className="mt-1 text-[12px] font-semibold text-amber-700">
              {locError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink hover:border-brand hover:text-brand"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
