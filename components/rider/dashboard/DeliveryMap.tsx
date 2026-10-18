"use client";

import dynamic from "next/dynamic";
import type { DeliveryRequest } from "@/data/rider-dashboard";
import type { ComponentType } from "react";

/**
 * Active-delivery map for the rider page.
 *
 * Two modes:
 *
 *   1. Before pickup (status `offered_to_rider` / `picked_up` + rider
 *      still at restaurant) — show the restaurant pin + the rider's
 *      live pin. Polyline is drawn from the rider to the restaurant.
 *
 *   2. After pickup (status `picked_up` / `on_the_way` + past the
 *      "Confirm Pickup" stage) — show the rider's live pin + the
 *      customer's delivery pin. Polyline is drawn from the rider to
 *      the customer.
 *
 * The map pulls the rider's location from `GET /api/riders/location`
 * every 10s while the page is open. The customer pin and the
 * restaurant pin come from `GET /api/orders/[id]` (which also
 * exposes the rider's last known location, but we re-poll
 * /api/riders/location here so the map refreshes on its own clock).
 *
 * Routing is computed via OSRM's public demo endpoint. If OSRM is
 * down or the route is empty we fall back to a straight line
 * between the two pins so the map still renders something useful.
 *
 * The component is loaded dynamically with `ssr: false` because
 * Leaflet touches `window` at module-eval time — the same
 * constraint the homepage AddressPicker already works around.
 */
const InnerDeliveryMap = dynamic(
  () =>
    import("./DeliveryMapInner").then(
      (m) => m.DeliveryMapInner as ComponentType<{
        request: DeliveryRequest;
        stage: "awaiting_pickup" | "en_route" | "delivered";
        refreshMs?: number;
      }>,
    ),
  { ssr: false },
);

export function DeliveryMap(props: {
  request: DeliveryRequest;
  /** Stage of the rider. Pre-pickup vs post-pickup drives which
   *  pins are shown. */
  stage: "awaiting_pickup" | "en_route" | "delivered";
  /** Polling interval for /api/riders/location while the rider is
   *  online. Default 10s — keeps the pin fresh without spamming. */
  refreshMs?: number;
}) {
  return <InnerDeliveryMap {...props} />;
}
