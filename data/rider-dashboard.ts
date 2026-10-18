/**
 * Types and helpers for the rider dashboard.
 *
 * The dashboard's real data (incoming requests, today's summary) is
 * fetched from `/api/orders` and computed from the signed-in rider's
 * actual order history. There is no demo seed here — `riderProfile`,
 * `deliveryRequests`, and `findDeliveryRequestById` were removed when
 * the dashboard moved to the real API.
 *
 * The shape types below stay exported because
 * `<RiderStatusCard />`, `<DeliveryStatusPanel />`, and
 * `<DeliveryMap />` still consume them on the active-delivery page.
 */

export type OrderLine = {
  name: string;
  qty: number;
};

/**
 * Minimal rider-facing delivery request shape used by the
 * dashboard's incoming-request card and the active-delivery page.
 *
 * `payment`, `distance`, `duration`, and `eta` aren't surfaced by
 * `/api/orders` today — they're synthesised on the client (with
 * sensible fallbacks) so the dashboard renders without a real
 * routing/ETA engine. Update `wireToDeliveryRequest` in
 * `RiderDeliveryPage.tsx` and the dashboard mapper to reflect
 * any future API additions.
 */
export type DeliveryRequest = {
  id: string;
  /** Short id like "#KD-XXXX" for human-friendly display. */
  shortId: string;
  pickupName: string;
  pickupAddress: string;
  dropoffName: string;
  dropoffAddress: string;
  /** Distance as a human string, e.g. "2.4 km". */
  distance: string;
  eta: string;
  /** Pre-formatted amount, e.g. "৳120". */
  earnings: string;
  /** Pre-formatted summary, e.g. "3 items". */
  itemSummary: string;
  /** Restaurant phone (optional — only present when the partner
   *  saved one). */
  restaurantPhone?: string;
  customerPhone?: string;
  /** Item breakdown for the active-delivery page. */
  items: OrderLine[];
  /** Optional ETA pin shown on the map placeholder. */
  dropoffEta?: string;
  /**
   * Feat 2 — customer's optional free-text delivery note. Null
   * when the customer left the field empty at checkout. The
   * rider's delivery page surfaces this right under the
   * drop-off block.
   */
  specialInstructions?: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Today's summary card                                                      */
/* -------------------------------------------------------------------------- */

export type TodaySummary = {
  /** Trips delivered today. */
  deliveries: number;
  /** BDT earned today (sum of rider's earnings from today's
   *  completed orders). Pre-formatted, e.g. "৳820". */
  earnings: string;
  /** Hours online today. */
  hoursOnline: string;
  /** Optional headline for the summary card. */
  headline: string;
};

/**
 * Zero-state factory used as the initial value before the first
 * poll lands. The dashboard replaces it with a computed summary
 * derived from the rider's real order history.
 */
export const initialTodaySummary: TodaySummary = {
  deliveries: 0,
  earnings: "৳0",
  hoursOnline: "0h 0m",
  headline: "No deliveries yet today.",
};
