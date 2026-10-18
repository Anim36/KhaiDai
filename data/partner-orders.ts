/**
 * Shape + helpers for the partner orders page.
 *
 * `OrderStatus` is re-exported from `partner-dashboard` so the
 * status pill, the orders page, and any future consumer all
 * converge on the same canonical union.
 *
 * `Order` here is the *UI* shape — the page does the projection
 * from `lib/useOrdersFeed`'s wire format (`WireOrder`) onto this
 * shape, so the table + modal only deal with one type.
 */

export type { OrderStatus } from "@/data/partner-dashboard";
import type { OrderStatus } from "@/data/partner-dashboard";

export type Order = {
  id: string;
  shortId: string;
  /** ISO timestamp so the table can format consistently. */
  placedAt: string;
  /** Display label e.g. "12:42 PM · 12 Apr 2025". */
  placedAtLabel: string;
  customerName: string;
  customerPhone: string;
  /** Full delivery address (shown in the modal). */
  customerAddress: string;
  /** "2× Beef Burger, 1× French Fries, 1× Coke" */
  itemsSummary: string;
  /** Per-line item breakdown for the modal. */
  items: Array<{ name: string; qty: number; price: string; lineTotal: number }>;
  total: string;
  subtotal: number;
  status: OrderStatus;
  /** Display-only — payment status. */
  paymentMethod: string;
  /** Feat 2 — customer's optional free-text delivery note. Null
   *  when omitted; rendered as a yellow callout box on the
   *  Incoming Orders row and the Order Detail modal. */
  specialInstructions?: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Filter tabs                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Tab buckets drive the page's status filter pills.
 *
 *   • All        → every order
 *   • New        → orders the partner still needs to action
 *   • Preparing  → orders the kitchen is making
 *   • Completed  → orders that finished their lifecycle (delivered)
 *   • Cancelled  → orders that were cancelled (either side)
 */
export type OrdersTabKey =
  | "all"
  | "new"
  | "preparing"
  | "completed"
  | "cancelled";

export const ordersTabs: Array<{ key: OrdersTabKey; labelKey: string }> = [
  { key: "all", labelKey: "partner.orders.filters.all" },
  { key: "new", labelKey: "partner.orders.filters.new" },
  { key: "preparing", labelKey: "partner.orders.filters.preparing" },
  { key: "completed", labelKey: "partner.orders.filters.delivered" },
  { key: "cancelled", labelKey: "partner.orders.filters.cancelled" },
];

/**
 * Date-range buckets the partner can pick from. We keep the
 * underlying `Order.placedAt` ISO timestamp untouched and filter on
 * the client side — the wire feed is the same regardless of which
 * range is active.
 */
export type OrdersRangeKey = "today" | "7d" | "30d" | "all";

export const ordersRanges: Array<{ key: OrdersRangeKey; labelKey: string }> = [
  { key: "today", labelKey: "partner.analytics.dateRange.today" },
  { key: "7d", labelKey: "partner.analytics.dateRange.thisWeek" },
  { key: "30d", labelKey: "partner.analytics.dateRange.thisMonth" },
  { key: "all", labelKey: "partner.analytics.dateRange.custom" },
];

/**
 * Convert a date-range key into a "minimum timestamp in ms" filter.
 * Returns 0 for "all time" so the predicate stays branchless.
 */
export function rangeFloorMs(range: OrdersRangeKey, now: number = Date.now()): number {
  switch (range) {
    case "today": {
      // Start of "today" in local time — so the partner sees everything
      // placed since 00:00 today.
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all":
      return 0;
  }
}

/**
 * Filter helper used by the page-level orchestrator. Keeps the
 * rule in one place so adding a new status doesn't require touching
 * the page component.
 */
export function filterOrders(items: Order[], tab: OrdersTabKey): Order[] {
  switch (tab) {
    case "all":
      return items;
    case "new":
      return items.filter((o) => o.status === "new");
    case "preparing":
      return items.filter(
        (o) =>
          o.status === "preparing" ||
          o.status === "ready" ||
          o.status === "picked-up",
      );
    case "completed":
      return items.filter((o) => o.status === "delivered");
    case "cancelled":
      return items.filter((o) => o.status === "cancelled");
  }
}
