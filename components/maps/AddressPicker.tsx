"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
// NOTE: do NOT `import L from "leaflet"` at module top — Leaflet
// touches `window` at load time, which crashes the entire
// `/partner/settings` page during SSR (Next.js renders the whole
// route to HTML on the server, including this module's imports).
// The `L` namespace is loaded lazily inside `MapBody`'s useEffect
// via `await import("leaflet")` and held in component state so
// the JSX never references it during SSR.
import { DHAKA_CENTER } from "@/lib/map/nominatim";
import { formatLatLng, useGeocoding } from "@/lib/useGeocoding";
import { MapPinIcon } from "@/components/icons";

/**
 * Single-point address picker — drop a draggable pin to fix a
 * restaurant / venue / branch on the map. Same UX as the rider
 * zone picker's search + "Use my current location" affordances,
 * but without the service-radius circle (this is a point
 * location, not a service area).
 *
 * Reusable surface:
 *   • partner registration form's "Restaurant Address" step
 *   • partner dashboard's restaurant-location editor
 *   • anywhere else we need a lat/lng + display name
 *
 * Controlled component:
 *   - `value` is `{ lat, lng, address } | null`
 *   - `onChange` fires whenever the user drops/drags a pin or
 *     selects a search suggestion (the address text is the
 *     reverse-geocoded display name)
 *
 * The map is dynamically imported so Leaflet's window-touching
 * imports don't break SSR — same pattern as `RiderZonePicker`.
 */
const Inner = dynamic(() => Promise.resolve(InnerPicker), { ssr: false });

export type AddressPick = {
  lat: number;
  lng: number;
  address: string;
};

export function AddressPicker({
  value,
  onChange,
  title = "Pick the restaurant location",
  description = "Search the area or use your current location. Drag the pin to fine-tune.",
  error,
  requireForSubmit = true,
}: {
  value: AddressPick | null;
  onChange: (next: AddressPick | null) => void;
  title?: string;
  description?: string;
  /** Rendered above the badge. Pass-through for the partner form. */
  error?: string;
  /** When false the parent does not gate the form on a pick being
   *  made — used by the dashboard editor where the partner can
   *  save other fields independently of the location. */
  requireForSubmit?: boolean;
}) {
  const [pick, setPick] = useState<AddressPick | null>(value);

  // Re-sync when the parent resets value to null (e.g. partner hits a
  // "Reset location" button). One-directional effect.
  useEffect(() => {
    setPick(value);
  }, [value]);

  // Don't keep state in two places; push local picks up so the
  // parent form can validate + submit them.
  const handleLocalPick = (next: AddressPick) => {
    setPick(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
      <header className="flex flex-col gap-1.5">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {title}
        </h2>
        <p className="text-[13px] text-ink-muted">{description}</p>
      </header>

      <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff5f3] text-brand">
          <MapPinIcon size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Pinned location
          </span>
          <span className="truncate text-[14px] font-bold text-ink">
            {pick ? pick.address || formatLatLng(pick.lat, pick.lng) : "—"}
          </span>
        </div>
        {pick ? (
          <span className="text-[12px] font-semibold text-emerald-700">
            Pinned
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-amber-700">
            Not pinned
          </span>
        )}
      </div>

      <div className="h-[360px] w-full overflow-hidden rounded-card border border-line">
        <Inner value={pick} onPick={handleLocalPick} />
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {error}
        </div>
      ) : !pick && requireForSubmit ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-[12px] font-semibold text-amber-700">
          Pick the restaurant location on the map to continue.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inner — search box + "Use my current location" + Leaflet map.               */
/* -------------------------------------------------------------------------- */

function InnerPicker({
  value,
  onPick,
}: {
  value: AddressPick | null;
  onPick: (loc: AddressPick) => void;
}) {
  const [position, setPosition] = useState<{ lat: number; lng: number }>(
    () =>
      value
        ? { lat: value.lat, lng: value.lng }
        : { lat: DHAKA_CENTER.lat, lng: DHAKA_CENTER.lng },
  );
  const [approximate, setApproximate] = useState(false);

  const geo = useGeocoding({ minQueryLength: 3, debounceMs: 500, limit: 6 });

  const handleDetect = async () => {
    const fix = await geo.detectLocation();
    if (!fix) return;
    setPosition({ lat: fix.lat, lng: fix.lng });
    setApproximate(fix.approximate);
    const r = await geo.reverseLookup(fix.lat, fix.lng);
    onPick({ lat: fix.lat, lng: fix.lng, address: r.displayName });
  };

  const handleSelectSuggestion = (s: { lat: number; lng: number; name: string }) => {
    const p = { lat: s.lat, lng: s.lng };
    setPosition(p);
    setApproximate(false);
    geo.setQuery(s.name);
    onPick({ lat: p.lat, lng: p.lng, address: s.name });
  };

  return (
    <div className="relative h-full w-full">
      {/* Floating control panel (search + current location). */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex flex-col gap-2">
        <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-line bg-white/95 p-2 shadow-card backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={geo.query}
              onChange={(e) => geo.setQuery(e.target.value)}
              placeholder="Search area, e.g. Dhanmondi, Dhaka"
              aria-label="Search restaurant address"
              data-action="address-search-input"
              className="h-9 w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-ink-muted"
            />
            {geo.geoSupported ? (
              <button
                type="button"
                onClick={handleDetect}
                disabled={geo.geolocating}
                data-action="address-use-location"
                aria-label="Use my current location"
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {geo.geolocating ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent"
                    />
                    Locating…
                  </>
                ) : (
                  "Use my current location"
                )}
              </button>
            ) : null}
          </div>
        </div>

        {geo.query.trim().length >= 3 ? (
          <div className="pointer-events-auto max-h-60 overflow-y-auto rounded-2xl border border-line bg-white shadow-card">
            {geo.searching ? (
              <p className="px-4 py-3 text-[13px] text-ink-muted">Searching…</p>
            ) : geo.suggestions.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-ink-muted">
                No places found. Try a different search.
              </p>
            ) : (
              <ul role="listbox" aria-label="Address suggestions">
                {geo.suggestions.map((s) => (
                  <li key={s.osmId} role="option">
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectSuggestion({
                          lat: s.lat,
                          lng: s.lng,
                          name: s.name,
                        })
                      }
                      data-action="address-search-suggestion"
                      className="flex w-full flex-col gap-0.5 border-b border-line/60 px-4 py-2 text-left text-[13px] last:border-b-0 hover:bg-surface"
                    >
                      <span className="font-semibold text-ink">{s.name}</span>
                      <span className="truncate text-[12px] text-ink-muted">
                        {s.summary}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {geo.geoError ? (
          <div
            role="alert"
            className="pointer-events-auto rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-700"
          >
            {geo.geoError}
          </div>
        ) : null}

        {approximate ? (
          <div
            role="status"
            className="pointer-events-auto rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-700"
          >
            This location may be approximate. Drag the pin to your exact position.
          </div>
        ) : null}
      </div>

      <MapBody
        position={position}
        onPositionChange={(p) => {
          setPosition(p);
          setApproximate(false);
        }}
        onPick={async (lat, lng) => {
          const r = await geo.reverseLookup(lat, lng);
          setApproximate(false);
          onPick({ lat, lng, address: r.displayName });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Map body — Leaflet runtime. No radius circle (single-point pick).          */
/* -------------------------------------------------------------------------- */

function MapBody({
  position,
  onPositionChange,
  onPick,
}: {
  position: { lat: number; lng: number };
  onPositionChange: (p: { lat: number; lng: number }) => void;
  onPick: (lat: number, lng: number) => void;
}) {
  const [libs, setLibs] = useState<null | {
    MapContainer: typeof import("react-leaflet").MapContainer;
    Marker: typeof import("react-leaflet").Marker;
    TileLayer: typeof import("react-leaflet").TileLayer;
    useMap: typeof import("react-leaflet").useMap;
    useMapEvents: typeof import("react-leaflet").useMapEvents;
  }>(null);
  // Leaflet's own `L` namespace — loaded the same way as the
  // react-leaflet bindings so SSR doesn't see a `window` reference
  // at module-evaluation time. The Marker below uses `L.Marker` for
  // its type, and the `divIcon` factory needs L.divIcon at runtime.
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        { MapContainer, Marker, TileLayer, useMap, useMapEvents },
        leafletMod,
      ] = await Promise.all([import("react-leaflet"), import("leaflet")]);
      await import("leaflet/dist/leaflet.css");
      if (cancelled) return;
      setL(leafletMod);
      setLibs({
        MapContainer,
        Marker,
        TileLayer,
        useMap,
        useMapEvents,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Marker icon — divIcon so we don't need leaflet's image assets.
  // Declared BEFORE the libs early-return so hooks order stays
  // stable across renders. Recomputed once `L` is available.
  const pinIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: "khaidai-address-pin",
      html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#e3340b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }, [L]);

  if (!libs || !L || !pinIcon) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-[12px] text-ink-muted">
        Loading map…
      </div>
    );
  }

  const {
    MapContainer: RC,
    Marker: RM,
    TileLayer: TL,
    useMap,
    useMapEvents,
  } = libs;

  return (
    <RC
      center={[position.lat, position.lng]}
      zoom={15}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "#eef2f7" }}
    >
      <TL
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToSet
        useMapEvents={useMapEvents}
        onClick={(lat, lng) => {
          onPositionChange({ lat, lng });
          onPick(lat, lng);
        }}
      />
      <FlyTo useMap={useMap} position={position} />
      <RM
        position={[position.lat, position.lng]}
        icon={pinIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const m = e.target as L.Marker;
            const ll = m.getLatLng();
            onPositionChange({ lat: ll.lat, lng: ll.lng });
            onPick(ll.lat, ll.lng);
          },
        }}
      />
    </RC>
  );
}

function ClickToSet({
  useMapEvents,
  onClick,
}: {
  useMapEvents: (handlers: {
    click?: (e: { latlng: { lat: number; lng: number } }) => void;
  }) => unknown;
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({
  useMap,
  position,
}: {
  useMap: () => L.Map;
  position: { lat: number; lng: number };
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([position.lat, position.lng], 15, { duration: 0.6 });
  }, [map, position.lat, position.lng]);
  return null;
}