"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Customer-facing live-tracking map.
 *
 * Wrapped in `next/dynamic` so Leaflet (which touches `window` at
 * module-eval time) never runs during SSR. The thin wrapper exists
 * so callers can write `<TrackingMap orderId="..." />` without
 * knowing about the dynamic-import dance.
 *
 * The map polls `/api/orders/[orderId]` every `refreshMs` ms and:
 *
 *   • Renders the restaurant + customer pins from
 *     `tracking.restaurantLocation` / `tracking.customerDropOff`.
 *   • Renders the rider pin from `tracking.riderLocation` when
 *     available. The privacy gate (`tracking.riderIsOnline`) makes
 *     sure we never broadcast a stale pin.
 *   • Fetches an OSRM road-route polyline between the rider and the
 *     destination. Falls back to a straight line if the public demo
 *     server is down.
 */
const Inner = dynamic(
  () =>
    import("./TrackingMapInner").then(
      (m) =>
        m.TrackingMapInner as ComponentType<{
          orderId: string;
          refreshMs?: number;
        }>,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-full items-center justify-center rounded-card border border-line bg-surface-soft text-[13px] font-semibold text-ink-muted">
        Loading map…
      </div>
    ),
  },
);

export function TrackingMap({
  orderId,
  refreshMs = 7_000,
}: {
  orderId: string;
  refreshMs?: number;
}) {
  return <Inner orderId={orderId} refreshMs={refreshMs} />;
}
