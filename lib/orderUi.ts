import type { OrderStatusApi } from "./orders";

/**
 * lib/orderUi.ts — UI-facing status mapping for the partner + rider
 * dashboards. The DB and the public API both use lowercase enum
 * strings ("pending", "preparing", "ready", "picked_up", …). The
 * partner / rider UI components however were written against a
 * kebab-case union ("new", "preparing", "ready", "picked-up", …)
 * shared across `data/partner-dashboard.ts` / `data/partner-orders.ts`.
 *
 * This file is the single translation seam. Whenever a UI enum value
 * appears in a TS file, it should be derived from this mapping so a
 * future rename only touches one place.
 */

export type PartnerOrderUiStatus =
  | "new"
  | "preparing"
  | "ready"
  | "picked-up"
  | "delivered"
  | "cancelled";

export function apiStatusToUi(s: OrderStatusApi): PartnerOrderUiStatus {
  switch (s) {
    case "pending":
      return "new";
    case "preparing":
      return "preparing";
    case "ready":
    case "offered_to_rider":
      return "ready";
    case "picked_up":
    case "on_the_way":
      return "picked-up";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * Tab buckets on the partner orders page. The "cancelled" tab is
 * a separate sibling of "completed" so a partner can audit
 * cancellations independently — the prior grouping under
 * `completed` hid cancellations inside the "done" view.
 */
export type OrdersTabKey =
  | "all"
  | "new"
  | "preparing"
  | "completed"
  | "cancelled";

export function countOrdersByTab(
  orders: { status: PartnerOrderUiStatus }[],
): Record<OrdersTabKey, number> {
  let all = 0;
  let isNew = 0;
  let isPreparing = 0;
  let isCompleted = 0;
  let isCancelled = 0;
  for (const o of orders) {
    all++;
    if (o.status === "new") isNew++;
    if (
      o.status === "preparing" ||
      o.status === "ready" ||
      o.status === "picked-up"
    )
      isPreparing++;
    if (o.status === "delivered") isCompleted++;
    if (o.status === "cancelled") isCancelled++;
  }
  return {
    all,
    new: isNew,
    preparing: isPreparing,
    completed: isCompleted,
    cancelled: isCancelled,
  };
}
