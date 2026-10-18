"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "@/lib/apiClient";

/* -------------------------------------------------------------------------- */
/*  Marker icons (inline SVG so the build never trips on Next/Leaflet asset paths) */
/* -------------------------------------------------------------------------- */

const RIDER_ICON = new L.DivIcon({
  className: "rider-pin",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#EA1A4F;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
    <div style="width:6px;height:6px;border-radius:9999px;background:#fff;"></div>
  </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const RESTAURANT_ICON = new L.Icon({
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 25 41' width='25' height='41'>
        <path d='M12.5 0C5.6 0 0 5.6 0 12.5 0 22.6 12.5 41 12.5 41S25 22.6 25 12.5C25 5.6 19.4 0 12.5 0z' fill='#111827'/>
        <circle cx='12.5' cy='12.5' r='5' fill='#fff'/>
      </svg>`,
    ),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const CUSTOMER_ICON = new L.Icon({
  iconUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 25 41' width='25' height='41'>
        <path d='M12.5 0C5.6 0 0 5.6 0 12.5 0 22.6 12.5 41 12.5 41S25 22.6 25 12.5C25 5.6 19.4 0 12.5 0z' fill='#16a34a'/>
        <circle cx='12.5' cy='12.5' r='5' fill='#fff'/>
      </svg>`,
    ),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type LatLng = { lat: number; lng: number };

type PolylinePoints = Array<[number, number]>;

type TrackingState = {
  rider: LatLng | null;
  customer: LatLng | null;
  restaurant: LatLng | null;
};

type TrackingApi = {
  riderLocation: LatLng | null;
  customerDropOff: LatLng | null;
  restaurantLocation: LatLng | null;
  riderIsOnline?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  RouteLayer — fetch + draw the OSRM polyline                                */
/* -------------------------------------------------------------------------- */

function RouteLayer({
  from,
  to,
  setRoute,
}: {
  from: LatLng | null;
  to: LatLng | null;
  setRoute: (pts: PolylinePoints | null) => void;
}) {
  const map = useMap();
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!from || !to) {
      setRoute(null);
      return;
    }
    const fitKey = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}|${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5_000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok || cancelled) {
          setRoute(null);
        } else {
          const body = (await res.json()) as {
            code?: string;
            routes?: Array<{
              geometry?: { coordinates?: Array<[number, number]> };
            }>;
          };
          if (
            body.code === "Ok" &&
            body.routes?.[0]?.geometry?.coordinates &&
            !cancelled
          ) {
            const pts: PolylinePoints = body.routes[0].geometry.coordinates
              .map(([lng, lat]) => [lat, lng])
              .filter(
                (p): p is [number, number] =>
                  typeof p[0] === "number" && typeof p[1] === "number",
              );
            setRoute(pts.length > 0 ? pts : null);
          } else {
            setRoute(null);
          }
        }
        if (fittedRef.current !== fitKey) {
          map.fitBounds(
            L.latLngBounds(
              [from.lat, from.lng],
              [to.lat, to.lng],
            ).pad(0.25),
            { animate: false },
          );
          fittedRef.current = fitKey;
        }
      } catch {
        setRoute(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, map, setRoute]);
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

const DHAKA_FALLBACK: [number, number] = [23.7806, 90.4074];

export function TrackingMapInner({
  orderId,
  refreshMs = 7_000,
}: {
  orderId: string;
  /** Polling interval for /api/orders/[id]. 7s strikes a balance
   *  between freshness and load. */
  refreshMs?: number;
}) {
  const [tracking, setTracking] = useState<TrackingState>({
    rider: null,
    customer: null,
    restaurant: null,
  });
  const [polyline, setPolyline] = useState<PolylinePoints | null>(null);
  const [riderActive, setRiderActive] = useState<boolean>(false);
  const [riderPulse, setRiderPulse] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch<{
          order?: { status?: string };
          tracking?: TrackingApi;
        }>(`/api/orders/${orderId}`);
        if (cancelled || !res.ok || !res.data?.tracking) return;
        const t = res.data.tracking;
        setTracking({
          rider: t.riderLocation ?? null,
          customer: t.customerDropOff ?? null,
          restaurant: t.restaurantLocation ?? null,
        });
        setRiderActive(Boolean(t.riderIsOnline && t.riderLocation));
        if (t.riderLocation) setRiderPulse((n) => n + 1);
      } catch {
        /* network hiccup — try again next tick */
      }
    };
    void tick();
    const t = setInterval(tick, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [orderId, refreshMs]);

  // Fit map to all three pins (when available) on first render.
  const center = useCenter(tracking);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "320px" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {tracking.restaurant ? (
          <Marker
            position={[tracking.restaurant.lat, tracking.restaurant.lng]}
            icon={RESTAURANT_ICON}
          />
        ) : null}
        {tracking.customer ? (
          <Marker
            position={[tracking.customer.lat, tracking.customer.lng]}
            icon={CUSTOMER_ICON}
          />
        ) : null}
        {tracking.rider ? (
          <Marker
            position={[tracking.rider.lat, tracking.rider.lng]}
            icon={RIDER_ICON}
          />
        ) : null}
        {polyline && polyline.length > 0 ? (
          <Polyline
            key={riderPulse}
            positions={polyline}
            pathOptions={{
              color: "#EA1A4F",
              weight: 4,
              opacity: 0.85,
            }}
          />
        ) : null}
        <RouteLayer
          from={tracking.rider}
          to={tracking.customer ?? tracking.restaurant}
          setRoute={setPolyline}
        />
      </MapContainer>
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-[12px] font-semibold text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="block h-3 w-3 rounded-full"
            style={{ background: "#111827" }}
          />
          Restaurant
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="block h-3 w-3 rounded-full"
            style={{ background: "#16a34a" }}
          />
          Your address
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="block h-3 w-3 rounded-full"
            style={{ background: "#EA1A4F" }}
          />
          Rider (live)
        </span>
        {riderActive ? null : (
          <span className="ml-auto text-rose-700">
            Rider's location will appear here when they go online.
          </span>
        )}
      </div>
    </div>
  );
}

function useCenter(t: TrackingState): [number, number] {
  const initial = useRef<[number, number] | null>(null);
  if (initial.current) return initial.current;
  const c: [number, number] = t.restaurant
    ? [t.restaurant.lat, t.restaurant.lng]
    : t.customer
      ? [t.customer.lat, t.customer.lng]
      : t.rider
        ? [t.rider.lat, t.rider.lng]
        : DHAKA_FALLBACK;
  initial.current = c;
  return c;
}
