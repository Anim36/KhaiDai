"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { DHAKA_CENTER } from "@/lib/map/nominatim";
import { formatLatLng, useGeocoding } from "@/lib/useGeocoding";
import { MapPinIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * "Set Service Zone" experience used by:
 *
 *   • the rider dashboard's **blocking** modal that appears when an
 *     existing rider hasn't picked a zone yet (one-shot gate before
 *     they can go online). Uses `mode="dashboard"` and persists the
 *     zone via `PUT /api/riders/zone`.
 *   • the rider registration form's "Service Zone" step. Uses
 *     `mode="register"` and **does NOT call the API** — instead the
 *     picked zone is bubbled up via `onSaved` and stored in the
 *     form's React state, then sent as part of the final
 *     `POST /api/auth/register/rider` payload. The auth-gated zone
 *     endpoint can't be hit during registration because there's no
 *     JWT yet.
 *
 * The map + 5 km circle + drag/click behaviour are kept identical
 * to the original implementation so the dashboard continues to
 * work without any caller changes. Two new affordances sit on top
 * of the map:
 *
 *   1. "Use my current location" — calls navigator.geolocation,
 *      drops the pin, reverse-geocodes the address. Hidden when
 *      the browser does not support geolocation. Errors get
 *      English-only copy from `lib/useGeocoding`.
 *   2. A search input + suggestion dropdown wired through the
 *      shared `useGeocoding` hook. Suggestions are debounced,
 *      use `AbortController`, respect Nominatim's 1 req/s usage
 *      policy and cover the whole of Bangladesh (`countrycodes=bd`
 *      with a country-wide viewbox).
 *
 * The radius is fixed at 5 km — the server clamps the value to 5
 * regardless of what the client sends. The `onSaved` payload
 * only ever reports the canonical 5.
 */

// We can't `next/dynamic` the MapContainer (Leaflet touches window
// at import time) — we do it here once, then render it normally.
const Inner = dynamic(() => Promise.resolve(InnerPicker), { ssr: false });

export const ZONE_RADIUS_KM = 5;

export function RiderZonePicker({
  initial,
  onCancel,
  onSaved,
  title,
  description,
  requireForSubmit = true,
  mode = "dashboard",
}: {
  initial?: { lat: number; lng: number; address?: string; radiusKm?: number };
  onCancel?: () => void;
  onSaved: (zone: { lat: number; lng: number; address: string; radiusKm: number }) => void;
  title?: string;
  description?: string;
  /**
   * If true, the Save button is disabled until the user has
   * dragged / clicked the pin to confirm a location.
   * (Used by the registration form so a fresh signup can't be
   * submitted with no zone.)
   */
  requireForSubmit?: boolean;
  /**
   * `mode="dashboard"` (default) — calls `PUT /api/riders/zone`
   * on Save. Used by the existing rider dashboard's blocking
   * modal where the JWT is already in localStorage.
   *
   * `mode="register"` — SKIPS the API call. Instead bubbles the
   * picked zone up via `onSaved` so the caller can hold it in
   * React state and POST it as part of the registration payload.
   * This is the only safe path during `/rider/register` because
   * there's no JWT yet — calling the auth-gated zone endpoint
   * produces a 401 "Missing Authorization header" the user can
   * see in the form. See Bug 5 fix.
   */
  mode?: "dashboard" | "register";
}) {
  const t = useT();
  const finalTitle = title ?? t("rider.auth.register.step4.title");
  const finalDescription =
    description ?? t("rider.auth.register.step4.description");
  const RADIUS_KM = initial?.radiusKm ?? ZONE_RADIUS_KM;
  const [pending, setPending] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(
    initial
      ? {
          lat: initial.lat,
          lng: initial.lng,
          address: initial.address ?? "",
        }
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = (loc: { lat: number; lng: number; address: string }) => {
    setPending(loc);
  };

  async function handleSave() {
    if (submitting) return;
    if (!pending) {
      setError(t("rider.auth.register.step4.zoneRequiredError"));
      return;
    }
    setError(null);

    // Bug 5 fix — register mode skips the API call. The endpoint
    // PUT /api/riders/zone requires an authenticated RIDER JWT
    // (requireRole(req, "RIDER")) and there's no JWT during
    // /rider/register, so hitting it produced a 401 "Missing
    // Authorization header" the user could see in the form.
    // The zone is instead bubbled up to the registration form via
    // `onSaved` and persisted as part of the register POST.
    if (mode === "register") {
      onSaved({
        lat: pending.lat,
        lng: pending.lng,
        address: pending.address,
        radiusKm: RADIUS_KM,
      });
      return;
    }

    // Dashboard mode (default) — server clamps to 5 km regardless
    // of what the client sends.
    setSubmitting(true);
    const res = await apiFetch<{
      zone: { lat: number; lng: number; address: string; radiusKm: number };
    }>("/api/riders/zone", {
      method: "PUT",
      body: JSON.stringify({
        lat: pending.lat,
        lng: pending.lng,
        address: pending.address,
        radiusKm: RADIUS_KM,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    onSaved(
      res.data?.zone ?? {
        lat: pending.lat,
        lng: pending.lng,
        address: pending.address,
        radiusKm: RADIUS_KM,
      },
    );
  }

  const canSave = pending !== null && !submitting;

  return (
    <div className="flex h-full w-full flex-col gap-3 rounded-card border border-line bg-white p-5">
      <header className="flex flex-col gap-1.5">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {finalTitle}
        </h2>
        <p className="text-[13px] text-ink-muted">{finalDescription}</p>
      </header>

      <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff5f3] text-brand">
          <MapPinIcon size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("rider.auth.register.step4.radius")}
          </span>
          <span className="text-[14px] font-bold text-ink">{RADIUS_KM} km</span>
        </div>
        <span className="text-[12px] text-ink-muted">
          {t("rider.auth.register.step4.radiusFixed")}
        </span>
      </div>

      <div className="h-[360px] w-full overflow-hidden rounded-card border border-line">
        <Inner initial={initial} radiusKm={RADIUS_KM} onPick={handlePick} t={t} />
      </div>

      {pending ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-[12px] text-ink-muted">
          <span className="font-semibold text-ink">
            {t("rider.auth.register.step4.selected")}{" "}
          </span>
          {pending.address || formatLatLng(pending.lat, pending.lng)}
        </p>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-[12px] font-semibold text-amber-700">
          {requireForSubmit
            ? t("rider.auth.register.step4.chooseToContinue")
            : t("rider.auth.register.step4.tip")}
        </p>
      )}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-end">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60"
          >
            {t("rider.auth.register.step4.cancel")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={requireForSubmit ? !canSave : submitting}
          data-action="save-zone"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting
            ? t("rider.auth.register.step4.saving")
            : t("rider.auth.register.step4.save")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inner (MapContainer + search box + current-location button).              */
/* -------------------------------------------------------------------------- */

function InnerPicker({
  initial,
  radiusKm,
  onPick,
  t,
}: {
  initial?: { lat: number; lng: number; address?: string; radiusKm?: number };
  radiusKm: number;
  onPick: (loc: { lat: number; lng: number; address: string }) => void;
  t: ReturnType<typeof useT>;
}) {
  const [position, setPosition] = useState<{
    lat: number;
    lng: number;
  }>(() =>
    initial
      ? { lat: initial.lat, lng: initial.lng }
      : { lat: DHAKA_CENTER.lat, lng: DHAKA_CENTER.lng },
  );
  const [approximate, setApproximate] = useState(false);

  const geo = useGeocoding({ minQueryLength: 3, debounceMs: 500, limit: 6 });

  const handleDetect = async () => {
    const fix = await geo.detectLocation();
    if (!fix) return; // error already surfaced via geo.geoError
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
              placeholder={t("rider.auth.register.step4.searchPlaceholder")}
              aria-label={t("rider.auth.register.step4.searchAria")}
              data-action="zone-search-input"
              className="h-9 w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-ink-muted"
            />
            {geo.geoSupported ? (
              <button
                type="button"
                onClick={handleDetect}
                disabled={geo.geolocating}
                data-action="zone-use-location"
                aria-label={t("rider.auth.register.step4.useMyLocation")}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {geo.geolocating ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent"
                    />
                    {t("rider.auth.register.step4.locating")}
                  </>
                ) : (
                  t("rider.auth.register.step4.useMyLocation")
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* Suggestions list */}
        {geo.query.trim().length >= 3 ? (
          <div className="pointer-events-auto max-h-60 overflow-y-auto rounded-2xl border border-line bg-white shadow-card">
            {geo.searching ? (
              <p className="px-4 py-3 text-[13px] text-ink-muted">
                {t("rider.dashboard.zonePicker.searching")}
              </p>
            ) : geo.suggestions.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-ink-muted">
                {t("rider.dashboard.zonePicker.noPlaces")}
              </p>
            ) : (
              <ul role="listbox" aria-label="Place suggestions">
                {geo.suggestions.map((s) => (
                  <li key={s.osmId} role="option">
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(s)}
                      data-action="zone-search-suggestion"
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

        {/* Geolocation error (English-only copy from the hook). */}
        {geo.geoError ? (
          <div
            role="alert"
            className="pointer-events-auto rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-700"
          >
            {geo.geoError}
          </div>
        ) : null}

        {/* Approximate fix warning — desktop / Wi-Fi geolocation
            usually reports 1km+ accuracy. The pin stays
            draggable so the rider can refine. */}
        {approximate ? (
          <div
            role="status"
            className="pointer-events-auto rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-700"
          >
            {t("rider.dashboard.zonePicker.approximateNote")}
          </div>
        ) : null}
      </div>

      <ZoneMapBody
        position={position}
        onPositionChange={(p) => {
          setPosition(p);
          setApproximate(false);
        }}
        radiusKm={radiusKm}
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
/*  Map body — same Leaflet runtime as before, but now the inner pick         */
/*  handlers always call `reverseLookup` so address stays in sync.            */
/* -------------------------------------------------------------------------- */

function ZoneMapBody({
  position,
  onPositionChange,
  radiusKm,
  onPick,
}: {
  position: { lat: number; lng: number };
  onPositionChange: (p: { lat: number; lng: number }) => void;
  radiusKm: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const t = useT();
  // Lazy-load leaflet + react-leaflet once on mount so SSR isn't
  // broken by Leaflet's window-touching imports.
  const [libs, setLibs] = useState<null | {
    MapContainer: typeof import("react-leaflet").MapContainer;
    Marker: typeof import("react-leaflet").Marker;
    TileLayer: typeof import("react-leaflet").TileLayer;
    Circle: typeof import("react-leaflet").Circle;
    useMap: typeof import("react-leaflet").useMap;
    useMapEvents: typeof import("react-leaflet").useMapEvents;
  }>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        { MapContainer, Marker, TileLayer, Circle, useMap, useMapEvents },
      ] = await Promise.all([import("react-leaflet")]);
      await import("leaflet/dist/leaflet.css");
      if (cancelled) return;
      setLibs({ MapContainer, Marker, TileLayer, Circle, useMap, useMapEvents });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Marker pin icon (divIcon so we don't need leaflet's image
  // assets). Declared BEFORE the libs early-return so hooks
  // order stays stable across renders.
  const pinIcon = useMemo(
    () =>
      L.divIcon({
        className: "khaidai-zone-pin",
        html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#e3340b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [],
  );

  if (!libs) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-[12px] text-ink-muted">
        {t("rider.dashboard.zonePicker.loadingMap")}
      </div>
    );
  }

  const {
    MapContainer: RC,
    Marker: RM,
    TileLayer: TL,
    Circle: RCi,
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
      <ZoneClickHandler
        useMapEvents={useMapEvents}
        onClick={(lat, lng) => {
          onPositionChange({ lat, lng });
          onPick(lat, lng);
        }}
      />
      <FlyTo useMap={useMap} position={position} />
      <RCi
        center={[position.lat, position.lng]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: "#e3340b",
          weight: 2,
          fillColor: "#e3340b",
          fillOpacity: 0.08,
        }}
      />
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

function ZoneClickHandler({
  useMapEvents,
  onClick,
}: {
  // `useMapEvents` is the react-leaflet hook — it returns the
  // Leaflet map instance so we can't narrow its return type.
  // We only care about the `click` event for this picker.
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
