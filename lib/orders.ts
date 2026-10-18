import "dotenv/config";
import type {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  MenuItem as PrismaMenuItem,
  User as PrismaUser,
  Restaurant as PrismaRestaurant,
} from "@prisma/client";

/**
 * lib/orders.ts — server-side mapping between the Prisma order rows
 * and the shape consumed by the customer / partner / rider UIs.
 *
 * Why this lives outside the route files:
 *   • The tracking page, the partner orders panel, the rider dashboard,
 *     and the customer profile all need a stable, denormalised view
 *     (id, customer name, items summary, total, status, etc.).
 *   • Centralising the mapping here means every API endpoint returns
 *     the same shape — no drift between `/api/orders`,
 *     `/api/orders/[id]`, and the polling re-fetches the client does.
 *
 * Two top-level helpers:
 *   • `orderStatusForApi(s)` — DB enum → API string (PENDING → "pending").
 *   • `orderStatusForDb(s)` — API string → DB enum ("ready" → READY).
 *   • `formatOrderResponse(row, opts)` — Prisma row → API JSON shape.
 *
 * The DB uses SCREAMING_SNAKE (`PENDING`, `PREPARING`, …) so it lines up
 * with the rest of the schema. The API uses lowercase strings so they
 * are stable across the JavaScript runtime without importing the
 * Prisma enum client-side.
 */

export const ORDER_STATUS_VALUES = [
  "pending",
  "preparing",
  "ready",
  "offered_to_rider",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatusApi = (typeof ORDER_STATUS_VALUES)[number];

export function isOrderStatusApi(value: unknown): value is OrderStatusApi {
  return (
    typeof value === "string" &&
    (ORDER_STATUS_VALUES as readonly string[]).includes(value)
  );
}

/** Convert DB enum → API string. */
export function orderStatusForApi(s: string): OrderStatusApi {
  return s.toLowerCase() as OrderStatusApi;
}

/** Convert API string → DB enum (validated). */
export function orderStatusForDb(
  s: string,
): "PENDING" | "PREPARING" | "READY" | "OFFERED_TO_RIDER" | "PICKED_UP" | "ON_THE_WAY" | "DELIVERED" | "CANCELLED" {
  switch (s) {
    case "pending":
      return "PENDING";
    case "preparing":
      return "PREPARING";
    case "ready":
      return "READY";
    case "offered_to_rider":
      return "OFFERED_TO_RIDER";
    case "picked_up":
      return "PICKED_UP";
    case "on_the_way":
      return "ON_THE_WAY";
    case "delivered":
      return "DELIVERED";
    case "cancelled":
      return "CANCELLED";
    default:
      throw new Error(`Unknown order status: ${s}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Row → API shape                                                            */
/* -------------------------------------------------------------------------- */

export type OrderRowWithItems = PrismaOrder & {
  items: (PrismaOrderItem & { menuItem: PrismaMenuItem | null })[];
  customer?: Pick<PrismaUser, "id" | "name" | "email" | "phone"> | null;
  // Restaurant doesn't carry a phone column today; address is the
  // canonical contact field. Add `phone` back once the schema grows it.
  restaurant?: Pick<PrismaRestaurant, "id" | "name" | "address"> | null;
  rider?: Pick<PrismaUser, "id" | "name" | "phone"> | null;
};

export type OrderApi = {
  id: string;
  status: OrderStatusApi;
  statusLabel: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  };
  restaurant: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
  };
  rider: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  items: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    price: number;
    lineTotal: number;
    /** Feat 1 — snapshot of the customer's chosen option groups
     *  for this line (denormalised labels + priceDelta). Null on
     *  legacy rows and on items without customisation.
     *  Shape: Array<{
     *    optionId, choiceIds,
     *    name, choiceLabels,
     *    priceDelta (৳, signed)
     *  }> | null
     */
    selectedOptions:
      | Array<{
          optionId: string;
          choiceIds: string[];
          name: string;
          choiceLabels: string[];
          priceDelta: number;
        }>
      | null;
  }>;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  deliveryAddress: string;
  paymentMethod: "CASH" | "BKASH" | "NAGAD" | "CARD";
  /** ধাপ ১ — SSLCommerz gateway state. `NOT_INITIATED` is also the
   *  value every Cash-on-Delivery order carries forever, so the UI
   *  must branch on `paymentMethod` before reading this. */
  paymentGatewayStatus:
    | "NOT_INITIATED"
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "CANCELLED";
  /** Bank / val-id returned by SSLCommerz after a successful
   *  server-to-server validation. Null until the payment is PAID. */
  gatewayTransactionId: string | null;
  /** ISO timestamp of gateway confirmation. Null on COD orders or
   *  orders paid before this column was added (2026-10-07). */
  paidAt: string | null;
  placedAt: string;
  /** Promo code the customer applied at checkout (null = none). */
  promoCode: string | null;
  /** Taka amount deducted from the subtotal via the promo code. */
  discountAmount: number;
  /** Customer's chosen delivery pin (null = fallback to typed address). */
  deliveryLat: number | null;
  deliveryLng: number | null;
  /** Snapshot of the haversine(restaurant → customer) distance. */
  distanceKm: number | null;
  /** Rider's share of the delivery fee at order-create time. */
  riderEarning: number | null;
  /** Feat 2 — customer's optional free-text note attached at
   *  checkout ("Ring the bell", "Leave at the door"). Capped at
   *  300 chars server-side. Null when omitted.
   */
  specialInstructions: string | null;
};

/** `picked_up` → "Picked Up", `on_the_way` → "On the Way".
 *  `offered_to_rider` is kept as a status label for backwards-compat
 *  — the new "dispatch on accept" flow uses PREPARING + a stamped
 *  riderId (rider sees the row as "Waiting for food"), but legacy
 *  rows still in flight carry the historical label "Looking for a
 *  rider".
 */
export const orderStatusLabel: Record<OrderStatusApi, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready for pickup",
  offered_to_rider: "Looking for a rider",
  picked_up: "Picked Up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function formatOrderResponse(
  row: OrderRowWithItems,
): OrderApi {
  const subtotal = row.items.reduce(
    (sum, it) => sum + it.price * it.quantity,
    0,
  );
  return {
    id: row.id,
    status: orderStatusForApi(row.status),
    statusLabel: orderStatusLabel[orderStatusForApi(row.status)],
    customer: {
      id: row.customer?.id ?? "",
      name: row.customer?.name ?? "Customer",
      phone: row.customer?.phone ?? null,
    },
    restaurant: {
      id: row.restaurant?.id ?? row.restaurantId,
      name: row.restaurant?.name ?? "Restaurant",
      address: row.restaurant?.address ?? "",
      // No phone column on Restaurant today — return null so the UI
      // can render an empty contact block until the schema adds it.
      phone: null,
    },
    rider: row.rider
      ? { id: row.rider.id, name: row.rider.name, phone: row.rider.phone }
      : null,
    items: row.items.map((it) => ({
      menuItemId: it.menuItemId,
      name: it.menuItem?.name ?? "Item",
      qty: it.quantity,
      price: it.price,
      lineTotal: it.price * it.quantity,
      // Feat 1 — surface the chosen option groups so the
      // tracking / partner / rider pages can render them.
      // `Prisma.JsonValue` is the raw Prisma type; we coerce to
      // our narrow shape for client consumption.
      selectedOptions:
        it.selectedOptions == null
          ? null
          : (it.selectedOptions as OrderApi["items"][number]["selectedOptions"]),
    })),
    subtotal,
    deliveryFee: row.deliveryFee,
    tax: row.tax,
    total: row.total,
    deliveryAddress: row.deliveryAddress,
    paymentMethod: row.paymentMethod,
    // Gateway fields — the admin orders table renders these so a
    // support agent can chase a disputed transaction.
    paymentGatewayStatus: row.paymentGatewayStatus,
    gatewayTransactionId: row.gatewayTransactionId ?? null,
    // When the gateway confirmed payment. NULL on COD or pre-feature
    // orders. The partner dashboard renders this as a "Paid Online"
    // badge; support / analytics consume it directly.
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    placedAt: row.createdAt.toISOString(),
    // Promo code metadata — null/absent on legacy orders that
    // predate the discount system.
    promoCode: row.promoCode ?? null,
    discountAmount: row.discountAmount ?? 0,
    // Distance snapshot + rider earning at order-create time. The
    // rider-facing pages use `riderEarning` to render the earnings
    // badge so the rider's page matches what was originally
    // earned even if `DeliveryFeeConfig` is later edited.
    deliveryLat: row.deliveryLat ?? null,
    deliveryLng: row.deliveryLng ?? null,
    distanceKm: row.distanceKm ?? null,
    riderEarning: row.riderEarning ?? null,
    // Feat 2 — optional customer note ("Ring the bell", etc.).
    specialInstructions: row.specialInstructions ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Status transition matrix                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Allowed status transitions per role. Used by PATCH /api/orders/[id]
 * to reject invalid state-machine moves (e.g. PENDING → DELIVERED).
 */
export const ORDER_TRANSITIONS: {
  PARTNER: Record<OrderStatusApi, OrderStatusApi[]>;
  RIDER: Record<OrderStatusApi, OrderStatusApi[]>;
  CUSTOMER: Record<OrderStatusApi, OrderStatusApi[]>;
} = {
  PARTNER: {
    pending: ["preparing", "cancelled"],
    // "Mark Ready" — but does NOT dispatch. Dispatch now happens on
    // accept (pending → preparing) so the rider sees the order in
    // "Waiting for food" while the partner cooks.
    preparing: ["ready", "cancelled"],
    ready: [], // partner can't move further — riders own pickup
    offered_to_rider: [], // legacy status, kept for old orders only
    picked_up: [],
    on_the_way: [],
    delivered: [],
    cancelled: [],
  },
  RIDER: {
    pending: [],
    // New flow: riderId is stamped at PREPARING (dispatch-on-accept).
    // Rider cannot move PREPARING → PICKED_UP — they have to wait for
    // the partner to "Mark Ready" (→ READY) first.
    preparing: [],
    // Rider "Receive" button. The button is only enabled after the
    // partner marks the order ready. Works whether the row was the
    // legacy READY or the post-restructure PREPARING + riderId path.
    ready: ["picked_up"],
    // Legacy OFFERED_TO_RIDER rows (pre-restructure) still need the
    // PICKED_UP transition so the dashboard doesn't break for old
    // orders that are in flight at deploy time.
    offered_to_rider: ["picked_up"],
    picked_up: ["on_the_way"],
    on_the_way: ["delivered"],
    delivered: [],
    cancelled: [],
  },
  CUSTOMER: {
    pending: ["cancelled"],
    preparing: [],
    ready: [],
    offered_to_rider: [],
    picked_up: [],
    on_the_way: [],
    delivered: [],
    cancelled: [],
  },
};

/** Returns true when `role` may transition `from` → `to`. */
export function canTransition(
  role: "PARTNER" | "RIDER" | "CUSTOMER",
  from: OrderStatusApi,
  to: OrderStatusApi,
): boolean {
  return ORDER_TRANSITIONS[role][from]?.includes(to) ?? false;
}
