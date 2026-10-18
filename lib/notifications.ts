import "dotenv/config";
import type {
  Notification,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * lib/notifications.ts — shared helpers for the in-app notification
 * feed.
 *
 * Three concerns live here:
 *   1. The wire DTO so every API route returns the same shape.
 *   2. A single `createNotification` entry point so every mutation
 *      that triggers a notification goes through one place (no
 *      drift between "Order status changed" and "Payout completed").
 *   3. A thin `notifyOrderUpdate` helper that takes an `Order` and
 *      writes the right row(s) for the recipient — keeping the
 *      trigger wording out of every API route.
 *
 * We intentionally don't use a Postgres `LISTEN/NOTIFY` channel or
 * any external queue — the API routes call `createNotification`
 * inline (with `await`) so a 200 to the client only ever ships
 * after the row is durable. If we ever outgrow that, swap the
 * helper for a broker-backed implementation and the callers don't
 * change.
 */

/* -------------------------------------------------------------------------- */
/*  DTO                                                                       */
/* -------------------------------------------------------------------------- */

/** Public wire shape — fields safe to expose to the recipient. */
export type NotificationDto = {
  id: string;
  title: string;
  message: string | null;
  type: NotificationType;
  isRead: boolean;
  relatedOrderId: string | null;
  createdAt: string;
};

/** Project a Prisma row onto the wire DTO. */
export function projectNotification(n: Notification): NotificationDto {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    isRead: n.isRead,
    relatedOrderId: n.relatedOrderId,
    createdAt: n.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Single-row create                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Insert one notification row for one user. Used directly by
 * non-order triggers (payout status, etc.) and as a building block
 * for the bulk `notifyOrderUpdate` helper below.
 *
 * `data.relatedOrderId` is kept as a plain string so deleting an
 * order never destroys notification history.
 */
export async function createNotification(
  userId: string,
  data: {
    title: string;
    message?: string | null;
    type?: NotificationType;
    relatedOrderId?: string | null;
  },
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      title: data.title,
      message: data.message ?? null,
      type: data.type ?? "SYSTEM",
      relatedOrderId: data.relatedOrderId ?? null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Bulk: order status update                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Map of order status transitions → notification payloads for the
 * customer. The dispatch-side notifications (partner / rider) are
 * written from the dispatch + PATCH endpoints directly — they have
 * access to the rider id and need to address the rider, not the
 * customer.
 *
 * Each value is the message we'd send if the customer *only* saw
 * the title. `message` is the more descriptive body.
 */
const CUSTOMER_ORDER_MESSAGES: Record<
  | "preparing"
  | "ready"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled",
  { title: string; message: string }
> = {
  preparing: {
    title: "Restaurant is preparing your order",
    message: "We've let the kitchen know. You'll get another ping when it's ready.",
  },
  ready: {
    title: "Your order is ready",
    message: "The rider will pick it up shortly.",
  },
  picked_up: {
    title: "Rider picked up your order",
    message: "Your food is on the way. You can track the rider live from your order page.",
  },
  on_the_way: {
    title: "On the way to you",
    message: "Your rider is heading to your delivery address now.",
  },
  delivered: {
    title: "Order delivered — enjoy!",
    message: "Tap here to rate the restaurant and the rider.",
  },
  cancelled: {
    title: "This order was cancelled",
    message: "Your order was cancelled. If you have any questions, reach out to support.",
  },
};

const ORDER_STATUSES_FOR_NOTIFY: Array<keyof typeof CUSTOMER_ORDER_MESSAGES> = [
  "preparing",
  "ready",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
];

/**
 * Notify the customer that their order moved to a new state. No-op
 * for transitions that don't have a customer-facing message (e.g.
 * `pending → accepted_by_partner`).
 *
 * Call this AFTER the order row has been updated so the trigger
 * can read the latest state without re-querying.
 */
export async function notifyCustomerOrderUpdate(
  order: {
    id: string;
    customerId: string;
    status: string;
  },
): Promise<void> {
  const status = order.status.toLowerCase();
  if (!ORDER_STATUSES_FOR_NOTIFY.includes(status as never)) return;
  const payload =
    CUSTOMER_ORDER_MESSAGES[status as keyof typeof CUSTOMER_ORDER_MESSAGES];
  await createNotification(order.customerId, {
    title: payload.title,
    message: payload.message,
    type: "ORDER_UPDATE",
    relatedOrderId: order.id,
  });
}

/* -------------------------------------------------------------------------- */
/*  Bulk: payout status change                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Notify a partner or rider that their payout moved to a new status.
 * Caller passes the resolved user id (one of these rows: restaurant
 * owner / rider) — we don't introspect which one here.
 */
export async function notifyPayoutStatus(
  userId: string,
  payout: {
    id: string;
    status: string;
    amount: number;
  },
): Promise<void> {
  const status = payout.status.toUpperCase();
  let title = "Payout status updated";
  let message = `Your payout is now ${status.replace(/_/g, " ")}.`;
  if (status === "COMPLETED") {
    title = "Payout completed";
    message = `Your payout of ৳${payout.amount} has been processed.`;
  } else if (status === "FAILED") {
    title = "Payout failed";
    message =
      "Your payout failed to process. Please check your payment account and contact support if this keeps happening.";
  }
  await createNotification(userId, {
    title,
    message,
    type: "SYSTEM",
    // Reuse relatedOrderId as an opaque reference id — it's just a
    // back-reference, the UI doesn't need to know it was an order.
    relatedOrderId: payout.id,
  });
}

/* -------------------------------------------------------------------------- */
/*  Aggregation helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Compute the unread count for a user. Wrapped here so callers don't
 * reach into Prisma directly with the same `where` twice.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Type-narrowing helper for the API route's `where` argument so the
 * `unread=true` query param can short-circuit to a smaller scan.
 */
export function notificationsWhere(
  userId: string,
  unreadOnly: boolean,
): Prisma.NotificationWhereInput {
  return unreadOnly
    ? { userId, isRead: false }
    : { userId };
}
