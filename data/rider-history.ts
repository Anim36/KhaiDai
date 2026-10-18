/**
 * Types and helpers for the rider history page.
 *
 * The actual list of completed + cancelled trips is fetched from
 * `/api/orders` (server scope: own orders, status in DELIVERED or
 * CANCELLED). The static `completedTrips` demo array used to live
 * here — it was removed once the real API was wired up so the
 * rider never sees another customer's name as a hardcoded string.
 *
 * `HistoryTabKey` + `filterTripsByTab` stay because they're pure
 * helpers the page orchestrator reuses on the real fetched list.
 */

export type TripStatus = "delivered" | "cancelled";

export type CompletedTrip = {
  id: string;
  /** Short code shown on the row + modal header, e.g. "#KD-8421". */
  shortId: string;
  /** ISO timestamp — the tab filter compares against today. */
  placedAt: string;
  /** Pre-formatted display string for the row. */
  placedAtLabel: string;
  restaurant: string;
  customer: string;
  customerPhone: string;
  customerAddress: string;
  /** Trip distance formatted "2.4 km". */
  distance: string;
  /** Trip duration formatted "18 min". */
  duration: string;
  /** Earnings for the trip, formatted "৳120". */
  earned: string;
  status: TripStatus;
  payment: "bKash" | "Cash" | "Card";
  /** 1-line reason when the trip was cancelled. */
  cancellationReason?: string;
};

export type HistoryTabKey = "today" | "week" | "month" | "all";

/**
 * Tab labels are sourced from `rider.history.tabs.*` so the UI
 * switches between English and Bangla without a per-locale array
 * sitting next to the type definition. `HistoryStatusTabs`
 * resolves the key into a translated label at render time.
 */
export const historyTabs: Array<{ key: HistoryTabKey }> = [
  { key: "today" },
  { key: "week" },
  { key: "month" },
  { key: "all" },
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Filter trips by the active tab. Anchored to `now` (defaults to
 * the current time, not a fixed reference) so the SSR/CSR
 * buckets stay accurate regardless of when the page is opened.
 * Falls back to "all" if an unknown key is passed.
 */
export function filterTripsByTab(
  items: CompletedTrip[],
  tab: HistoryTabKey,
  now: Date = new Date(),
): CompletedTrip[] {
  switch (tab) {
    case "today":
      return items.filter((t) =>
        isSameDay(new Date(t.placedAt), now),
      );
    case "week": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 6); // 7-day window incl. today
      return items.filter((t) => {
        const d = new Date(t.placedAt);
        return d >= start && d <= now;
      });
    }
    case "month": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 29); // 30-day window incl. today
      return items.filter((t) => {
        const d = new Date(t.placedAt);
        return d >= start && d <= now;
      });
    }
    case "all":
      return items;
  }
}
