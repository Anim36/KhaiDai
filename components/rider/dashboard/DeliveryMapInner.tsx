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
import type { DeliveryRequest } from "@/data/rider-dashboard";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Marker icons (inline SVG so the map always renders, no 404s)               */
/* -------------------------------------------------------------------------- */

const RIDER_ICON = new L.DivIcon({
  className: "rider-pin",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#EA1A4F;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>`,
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
/*  Map helpers                                                               */
/* -------------------------------------------------------------------------- */

const DHAKA_FALLBACK: [number, number] = [23.7806, 90.4074];

type LatLng = { lat: number; lng: number };

type TrackingState = {
  rider: LatLng | null;
  customer: LatLng | null;
  restaurant: LatLng | null;
};

type PolylinePoints = Array<[number, number]>; // [lat, lng]

/**
 * Internal child component that handles OSRM route fetch + auto-fit
 * to the visible pins whenever the inputs change. Separated from the
 * parent so React-Leaflet's `useMap` runs inside `<MapContainer>`.
 */
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
    (async () => {
      const fitKey = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}|${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
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
        // Auto-fit on first arrival of new from/to pair.
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

export function DeliveryMapInner({
  request,
  stage,
  refreshMs = 10_000,
}: {
  request: DeliveryRequest;
  stage: "awaiting_pickup" | "en_route" | "delivered";
  refreshMs?: number;
}) {
  const tr = useT();
  // Pull the order's tracking metadata (rider, restaurant, drop-off)
  // and the rider's live location. We re-fetch the order each tick so
  // the rider / customer drop-off stays current.
  const [tracking, setTracking] = useState<TrackingState>({
    rider: null,
    customer: null,
    restaurant: null,
  });
  const [polyline, setPolyline] = useState<PolylinePoints | null>(null);
  const [riderPulse, setRiderPulse] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [orderRes, riderRes] = await Promise.all([
          apiFetch<{
            order?: unknown;
            tracking?: TrackingState;
          }>(`/api/orders/${request.id}`),
          apiFetch<{
            rider?: {
              lat: number | null;
              lng: number | null;
              isOnline: boolean;
            };
          }>("/api/riders/location"),
        ]);
        if (cancelled) return;
        if (orderRes.ok && orderRes.data?.tracking) {
          setTracking((prev) => ({
            ...prev,
            customer: orderRes.data!.tracking!.customer ?? prev.customer,
            restaurant: orderRes.data!.tracking!.restaurant ?? prev.restaurant,
          }));
        }
        if (riderRes.ok && riderRes.data?.rider?.isOnline) {
          const r = riderRes.data.rider;
          if (
            typeof r.lat === "number" &&
            typeof r.lng === "number"
          ) {
            setTracking((prev) => ({
              ...prev,
              rider: { lat: r.lat as number, lng: r.lng as number },
            }));
            setRiderPulse((n) => n + 1);
          }
        }
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
  }, [request.id, refreshMs]);

  // Decide which two pins the polyline connects.
  //   • Before pickup  → rider → restaurant
  //   • After pickup   → rider → customer
  // After delivery we hide the polyline (terminal state).
  const leg =
    stage === "delivered"
      ? null
      : stage === "awaiting_pickup"
        ? {
            from: tracking.rider,
            to: tracking.restaurant,
          }
        : {
            from: tracking.rider,
            to: tracking.customer,
          };

  const customer = tracking.customer;
  const restaurant = tracking.restaurant;

  // Initial map center — fall back to restaurant, then customer,
  // then Dhaka.
  const center: [number, number] = leg?.to
    ? [leg.to.lat, leg.to.lng]
    : riderWantedCenter(tracking) ?? DHAKA_FALLBACK;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "360px" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {restaurant ? (
          <Marker
            position={[restaurant.lat, restaurant.lng]}
            icon={RESTAURANT_ICON}
          />
        ) : null}
        {customer ? (
          <Marker
            position={[customer.lat, customer.lng]}
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
              dashArray: undefined,
              opacity: 0.85,
            }}
          />
        ) : null}
        <RouteLayer
          from={leg?.from ?? null}
          to={leg?.to ?? null}
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
          {tr("rider.map.restaurant")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="block h-3 w-3 rounded-full"
            style={{ background: "#16a34a" }}
          />
          {tr("rider.map.customer")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="block h-3 w-3 rounded-full"
            style={{ background: "#EA1A4F" }}
          />
          {tr("rider.map.riderLive")}
        </span>
        {!tracking.rider ? (
          <span className="ml-auto text-rose-700">
            {tr("rider.dashboard.map.riderMustBeOnline")}
          </span>
        ) : null}
        {!customer && stage !== "awaiting_pickup" ? (
          <span className="ml-auto text-amber-700">
            {tr("rider.dashboard.map.customerPinMissing")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function riderWantedCenter(t: TrackingState): [number, number] | null {
  if (t.restaurant) return [t.restaurant.lat, t.restaurant.lng];
  if (t.customer) return [t.customer.lat, t.customer.lng];
  if (t.rider) return [t.rider.lat, t.rider.lng];
  return null;
}
