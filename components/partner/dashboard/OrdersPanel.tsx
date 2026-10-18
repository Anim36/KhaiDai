"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  orderStatusMeta,
  type OrderStatus,
} from "@/data/partner-dashboard";
import { OrderStatusPill } from "@/components/partner/dashboard/OrderStatusPill";
import { apiFetch } from "@/lib/apiClient";
import { useOrdersFeed, refreshOrdersFeed } from "@/lib/useOrdersFeed";
import {
  apiStatusToUi,
  type PartnerOrderUiStatus,
} from "@/lib/orderUi";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Wire shape                                                                */
/* -------------------------------------------------------------------------- */

type WireOrder = {
  id?: string;
  status?: import("@/lib/orders").OrderStatusApi;
  statusLabel?: string;
  placedAt?: string;
  customer?: { id?: string; name?: string; phone?: string | null };
  restaurant?: { name?: string };
  items?: Array<{ name?: string; qty?: number }>;
  subtotal?: number;
  total?: number;
  paymentMethod?: string;
  deliveryAddress?: string;
  /** Feat 2 — customer's optional delivery note. */
  specialInstructions?: string | null;
};

type IncomingOrder = {
  id: string;
  shortId: string;
  placedAt: string;
  customerName: string;
  customerSubtitle: string;
  itemsSummary: string;
  total: string;
  status: PartnerOrderUiStatus;
  /** Feat 2 — customer's optional delivery note. Rendered in
   *  a highlighted callout box on the incoming-order row. */
  specialInstructions?: string | null;
};

function wireToUi(order: WireOrder): IncomingOrder {
  const safeStr = (s: unknown, fallback = ""): string =>
    typeof s === "string" ? s : fallback;
  const safeNum = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;

  const id = safeStr(order.id);
  // Build a short visible id from the tail of the cuid.
  const shortId = `#KD-${id.slice(-4).toUpperCase()}`;
  const placedAt = safeStr(order.placedAt)
    ? new Date(safeStr(order.placedAt)).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.map(
    (i) => `${safeNum(i.qty)}× ${safeStr(i.name, "Item")}`,
  );
  const itemsSummary = itemLines.slice(0, 3).join(", ") || "—";
  const status = apiStatusToUi(
    safeStr(order.status, "pending") as Parameters<typeof apiStatusToUi>[0],
  );
  return {
    id,
    shortId,
    placedAt,
    customerName: safeStr(order.customer?.name, "Customer"),
    customerSubtitle:
      safeStr(order.customer?.phone) ||
      safeStr(order.deliveryAddress, "—").slice(0, 30),
    itemsSummary,
    total: formatTaka(safeNum(order.total)),
    status,
    // Feat 2 — carry the customer's note into the row.
    specialInstructions:
      typeof order.specialInstructions === "string"
        ? order.specialInstructions
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Panel                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Incoming Orders panel on the partner dashboard.
 *
 *   • Loads `/api/orders` (which scopes to the partner's own restaurant)
 *     on mount and re-polls every 8 s so a new PENDING order from a
 *     customer shows up without a manual refresh.
 *   • Accept = PATCH `pending → preparing`.
 *   • Reject = PATCH `pending → cancelled`.
 *   • When status is `preparing` the row exposes a **Ready** button
 *     that PATCHes `preparing → ready` so riders can pick it up.
 *
 * Feature — Accept/Reject render for EVERY new (status === "new")
 * order regardless of `paymentMethod`. COD or paid, the partner
 * has the same right to reject (e.g. an item ran out). A paid
 * order that the partner rejects flows back through the existing
 * Feat-3 wallet refund path; nothing in this branch reads
 * `paymentMethod` / `paymentGatewayStatus`. If you ever want to
 * branch on payment, do it AFTER the Accept/Reject decision, never
 * before.
 *
 *   • Empty state + error state each render their own block so the
 *     partner is never left guessing.
 */
export function OrdersPanel() {
  const t = useT();
  // Single shared polling source — see lib/useOrdersFeed.ts. The
  // partner dashboard's OrdersPanel, the PartnerOrdersPage table and
  // the dashboard's metric strip all read from this same snapshot.
  const feed = useOrdersFeed("PARTNER");
  const orders = useMemo(
    () => feed.orders.map(wireToUi),
    [feed.orders],
  );
  const loading = feed.loading && orders.length === 0;
  const error = feed.error;

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => refreshOrdersFeed("PARTNER"), []);

  const mutate = useCallback(
    async (id: string, next: import("@/lib/orders").OrderStatusApi) => {
      setPendingId(id);
      setActionError(null);
      const res = await apiFetch<unknown>(
        `/api/orders/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: next }),
        },
      );
      if (!res.ok) {
        setActionError(res.error.message);
        setPendingId(null);
        return;
      }
      // Ask the shared feed to refresh once after a mutation so the
      // partner sees the change immediately without waiting for the
      // next poll tick.
      await reload();
      setPendingId(null);
    },
    [reload],
  );

  const handleAccept = (id: string) => mutate(id, "preparing");
  const handleReject = (id: string) => mutate(id, "cancelled");
  const handleReady = (id: string) => mutate(id, "ready");

  return (
    <section
      aria-label={t("partner.dashboard.incomingOrders.title")}
      className="flex flex-col gap-5 rounded-3xl border border-line bg-white p-6 w-full"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {t("partner.dashboard.incomingOrders.title")}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {t("partner.dashboard.incomingOrders.subtitle")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("partner.common.retry")}
          onClick={() => reload()}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink"
        >
          <RefreshCwIcon size={14} />
          {t("partner.common.retry")}
        </button>
      </header>

      <div className="h-px w-full bg-line" aria-hidden />

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-1 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {t("partner.common.loadFailed")}: {error}
        </div>
      ) : null}
      {actionError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"
        >
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <Skeleton />
      ) : orders.length === 0 ? (
        <OrdersEmptyState />
      ) : (
        <ul className="flex flex-col gap-4 w-full">
          {orders.map((order) => (
            <li key={order.id} className="w-full">
              <OrderRow
                order={order}
                pending={pendingId === order.id}
                onAccept={() => handleAccept(order.id)}
                onReject={() => handleReject(order.id)}
                onReady={() => handleReady(order.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                              */
/* -------------------------------------------------------------------------- */

function OrdersEmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffebe8] text-brand"
      >
        <BagIcon size={28} />
      </span>
      <span className="font-display text-[15px] font-extrabold text-ink">
        {t("partner.dashboard.incomingOrders.empty")}
      </span>
      <p className="max-w-xs text-[13px] text-ink-muted">
        When customers place an order from your restaurant page, it
        will show up here for you to accept or reject.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[68px] animate-pulse rounded-xl border border-line bg-surface"
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bag icon (local)                                                         */
/* -------------------------------------------------------------------------- */

function BagIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M5 7h14l-1.2 11.5a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7L5 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 11V8a3 3 0 0 1 6 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshCwIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 12a9 9 0 0 1 15.5-6.36L21 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3v4h-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12a9 9 0 0 1-15.5 6.36L3 17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 21v-4h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Order row                                                                */
/* -------------------------------------------------------------------------- */

function OrderRow({
  order,
  pending,
  onAccept,
  onReject,
  onReady,
}: {
  order: IncomingOrder;
  pending: boolean;
  onAccept: () => void;
  onReject: () => void;
  onReady: () => void;
}) {
  const t = useT();
  const isNew = order.status === "new";
  const isPreparing = order.status === "preparing";
  // Reuse the existing partner-dashboard status-pill colour map.
  return (
    <article
      className="flex flex-col gap-4 rounded-xl border border-line p-4 md:flex-row md:items-center md:justify-between"
      data-order-id={order.id}
      data-order-status={order.status}
    >
      <div className="flex flex-1 flex-wrap items-start gap-4">
        <div className="flex w-full flex-col gap-1 md:w-[100px]">
          <span className="font-display text-[14px] font-extrabold text-ink">
            {order.shortId}
          </span>
          <span className="text-[12px] text-ink-muted">{order.placedAt}</span>
        </div>

        <div className="flex flex-1 flex-col gap-1 min-w-0 md:max-w-[400px]">
          <span className="font-display text-[14px] font-bold text-ink truncate">
            {order.customerName}
          </span>
          <span className="text-[12px] text-ink-muted truncate">
            {order.customerSubtitle}
          </span>
          <span className="text-[12px] text-ink-muted truncate">
            {order.itemsSummary}
          </span>
          {/* Feat 2 — customer note callout. Yellow/amber
              border so it pops against the rest of the row. */}
          {order.specialInstructions ? (
            <div
              role="note"
              className="mt-1 flex flex-col gap-0.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
            >
              <span className="font-bold uppercase tracking-wide text-amber-700">
                Customer note
              </span>
              <span className="leading-snug">
                {order.specialInstructions}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-1 md:w-auto md:items-end">
          <span className="text-[12px] text-ink-muted md:text-right">
            Total
          </span>
          <span className="font-display text-[15px] font-extrabold text-ink">
            {order.total}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-5">
        <OrderStatusPill status={order.status} />
        {pending ? (
          <span className="text-[12px] text-ink-muted">{t("partner.common.pleaseWait")}</span>
        ) : isNew ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReject}
              className="rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("partner.dashboard.incomingOrders.reject")}
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("partner.dashboard.incomingOrders.accept")}
            </button>
          </div>
        ) : isPreparing ? (
          <button
            type="button"
            onClick={onReady}
            className="rounded-lg bg-[#dcfce7] px-4 py-2 text-[13px] font-semibold text-[#16a34a] transition-opacity hover:opacity-90"
          >
            {t("partner.dashboard.incomingOrders.markReady")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

// Re-export the existing status metadata so the modal/orders page can
// keep using the same pill colours.
export { orderStatusMeta };
export type { OrderStatus };
