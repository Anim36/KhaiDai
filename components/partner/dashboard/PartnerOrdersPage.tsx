"use client";

import { useCallback, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { PartnerOrdersHeader } from "@/components/partner/dashboard/PartnerOrdersHeader";
import { OrdersStatusTabs } from "@/components/partner/dashboard/OrdersStatusTabs";
import { OrdersTable } from "@/components/partner/dashboard/OrdersTable";
import { OrderDetailModal } from "@/components/partner/dashboard/OrderDetailModal";
import {
  apiStatusToUi,
  countOrdersByTab,
  type OrdersTabKey,
  type PartnerOrderUiStatus,
} from "@/lib/orderUi";
import {
  rangeFloorMs,
  ordersRanges,
  type OrdersRangeKey,
} from "@/data/partner-orders";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import { apiFetch } from "@/lib/apiClient";
import { useOrdersFeed, refreshOrdersFeed } from "@/lib/useOrdersFeed";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Wire shape + UI projection                                                */
/* -------------------------------------------------------------------------- */

type WireOrder = {
  id?: string;
  status?: import("@/lib/orders").OrderStatusApi;
  statusLabel?: string;
  customer?: { id?: string; name?: string; phone?: string | null };
  restaurant?: { name?: string };
  items?: Array<{ name?: string; qty?: number; lineTotal?: number }>;
  total?: number;
  subtotal?: number;
  paymentMethod?: string;
  deliveryAddress?: string;
  placedAt?: string;
};

type Order = {
  id: string;
  shortId: string;
  placedAt: string;
  placedAtLabel: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  itemsSummary: string;
  items: Array<{ name: string; qty: number; price: string; lineTotal: number }>;
  total: string;
  subtotal: number;
  status: PartnerOrderUiStatus;
  paymentMethod: string;
};

function wireToUi(o: WireOrder): Order {
  const safeStr = (s: unknown, fallback = ""): string =>
    typeof s === "string" ? s : fallback;
  const safeNum = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;
  const id = safeStr(o.id);
  const shortId = `#KD-${id.slice(-4).toUpperCase()}`;
  const placedAt = safeStr(o.placedAt);
  const placedAtLabel = placedAt
    ? new Date(placedAt).toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      })
    : "—";
  const items = Array.isArray(o.items) ? o.items : [];
  return {
    id,
    shortId,
    placedAt: placedAt || new Date().toISOString(),
    placedAtLabel,
    customerName: safeStr(o.customer?.name, "Customer"),
    customerPhone: safeStr(o.customer?.phone, "—"),
    customerAddress: safeStr(o.deliveryAddress, "—"),
    itemsSummary:
      items
        .slice(0, 4)
        .map((i) => `${safeNum(i.qty)}× ${safeStr(i.name, "Item")}`)
        .join(", ") || "—",
    items: items.map((i) => ({
      name: safeStr(i.name, "Item"),
      qty: safeNum(i.qty),
      price: formatTaka(safeNum(i.lineTotal)),
      lineTotal: safeNum(i.lineTotal),
    })),
    total: formatTaka(safeNum(o.total)),
    subtotal: safeNum(o.subtotal),
    status: apiStatusToUi(
      safeStr(o.status, "pending") as Parameters<typeof apiStatusToUi>[0],
    ),
    paymentMethod: safeStr(o.paymentMethod, "CASH"),
  };
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How many orders to show at a time. Once the partner crosses this
 * threshold we paginate locally (the underlying `/api/orders` call
 * already streams everything we have, so this is a *render* slice,
 * not a server fetch). Date filter is applied BEFORE pagination so
 * the user always sees the most-recent slice of their chosen range.
 */
const PAGE_SIZE = 25;

/* -------------------------------------------------------------------------- */
/*  Page orchestrator                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Orchestrator for /partner/orders.
 *
 *   • Two-column shell: 260px sidebar + flex-1 main.
 *   • Header + status-tab filter + table.
 *   • Polling: refetch `/api/orders` every 8 seconds so a new PENDING
 *     order from a customer appears without a manual refresh.
 *   • Date filter (Today / 7d / 30d / All) sits above the tabs so a
 *     partner with months of orders can still find what they're
 *     looking for without scrolling.
 *   • Pagination: show 25 per page inside the current filter set;
 *     "Show more" reveals the next slice.
 *   • Accept = `pending → preparing`, Reject = `pending → cancelled`,
 *     Ready = `preparing → ready`. The modal re-uses the same PATCH.
 */
export function PartnerOrdersPage() {
  const t = useT();
  // Shared PARTNER feed — same snapshot the dashboard's OrdersPanel
  // and the metric strip use, so we don't fire three parallel polls.
  const feed = useOrdersFeed("PARTNER");
  const orders = useMemo(() => feed.orders.map(wireToUi), [feed.orders]);
  const loading = feed.loading && orders.length === 0;
  const error = feed.error;

  const [activeTab, setActiveTab] = useState<OrdersTabKey>("all");
  const [activeRange, setActiveRange] = useState<OrdersRangeKey>("all");
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Local action-error shown above the table when a mutate fails
  // (the feed-level error stays inside the page's primary banner).
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => refreshOrdersFeed("PARTNER"), []);

  // Apply the date range first so the tab counts reflect the
  // partner's chosen window.
  const ranged = useMemo(() => {
    const floor = rangeFloorMs(activeRange);
    if (floor === 0) return orders;
    return orders.filter((o) => {
      const t = new Date(o.placedAt).getTime();
      return Number.isFinite(t) && t >= floor;
    });
  }, [orders, activeRange]);

  const counts = useMemo(() => countOrdersByTab(ranged), [ranged]);

  // Status-tab filter on top of the date range. Pure predicate so
  // we don't depend on `countOrdersByTab` having to know about
  // every future tab key.
  const tabbed = useMemo(() => {
    switch (activeTab) {
      case "all":
        return ranged;
      case "new":
        return ranged.filter((o) => o.status === "new");
      case "preparing":
        return ranged.filter(
          (o) =>
            o.status === "preparing" ||
            o.status === "ready" ||
            o.status === "picked-up",
        );
      case "completed":
        return ranged.filter((o) => o.status === "delivered");
      case "cancelled":
        return ranged.filter((o) => o.status === "cancelled");
    }
  }, [ranged, activeTab]);

  // Newest first.
  const sorted = useMemo(
    () =>
      [...tabbed].sort((a, b) => {
        const ta = new Date(a.placedAt).getTime();
        const tb = new Date(b.placedAt).getTime();
        return tb - ta;
      }),
    [tabbed],
  );

  const visible = useMemo(
    () => sorted.slice(0, pageSize),
    [sorted, pageSize],
  );
  const hasMore = sorted.length > visible.length;

  const openOrder = openOrderId
    ? (orders.find((o) => o.id === openOrderId) ?? null)
    : null;

  const handleAccept = (id: string) => {
    setPendingId(id);
    void apiFetch(`/api/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "preparing" }),
    }).then(async (res) => {
      setPendingId(null);
      if (res.ok) {
        setOpenOrderId(null);
        await reload();
      } else {
        setActionError(res.error.message);
      }
    });
  };

  const handleReject = (id: string) => {
    setPendingId(id);
    // The new POST /api/orders/[id]/cancel endpoint enforces the same
    // "PENDING/PREPARING only" rule as the PATCH matrix but also
    // captures an optional reason and fires the cross-party
    // notification in one round-trip. We don't currently collect a
    // reason from the modal — the partner can add it later — so we
    // POST an empty body for now.
    void apiFetch(`/api/orders/${id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).then(async (res) => {
      setPendingId(null);
      if (res.ok) {
        setOpenOrderId(null);
        await reload();
      } else {
        setActionError(res.error.message);
      }
    });
  };

  const handleReady = (id: string) => {
    setPendingId(id);
    void apiFetch(`/api/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "ready" }),
    }).then(async (res) => {
      setPendingId(null);
      if (res.ok) {
        setOpenOrderId(null);
        await reload();
      } else {
        setActionError(res.error.message);
      }
    });
  };

  return (
    <RequireAuth role="PARTNER">
      <PartnerShell activeKey="orders">
          <PartnerOrdersHeader />

          <div className="flex flex-1 flex-col gap-6 p-8">
            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
              >
                {t("partner.common.loadFailed")}: {error}
              </div>
            ) : null}

            <DateRangePicker
              active={activeRange}
              onSelect={(r) => {
                setActiveRange(r);
                // Reset paging so the partner sees the most-recent
                // rows of the new range, not page 3 of an old one.
                setPageSize(PAGE_SIZE);
              }}
            />

            <OrdersStatusTabs
              active={activeTab}
              counts={counts}
              onSelect={setActiveTab}
            />

            {loading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[72px] animate-pulse rounded-2xl border border-line bg-white"
                  />
                ))}
              </div>
            ) : (
              <>
                <OrdersTable
                  orders={visible}
                  totalOrders={sorted.length}
                  onOpen={setOpenOrderId}
                />
                {hasMore ? (
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setPageSize((s) => s + PAGE_SIZE)}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink-muted hover:bg-line"
                    >
                      {t("partner.orders.viewDetails")}
                    </button>
                    <span className="text-[11px] text-ink-muted">
                      {visible.length} / {sorted.length}
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>

        <OrderDetailModal
          order={openOrder}
          pending={pendingId === openOrder?.id}
          onAccept={handleAccept}
          onReject={handleReject}
          onReady={handleReady}
          onClose={() => setOpenOrderId(null)}
        />
      </PartnerShell>
    </RequireAuth>
  );
}

/* -------------------------------------------------------------------------- */
/*  DateRangePicker                                                          */
/* -------------------------------------------------------------------------- */

function DateRangePicker({
  active,
  onSelect,
}: {
  active: OrdersRangeKey;
  onSelect: (key: OrdersRangeKey) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {t("partner.analytics.dateRange.label")}
      </span>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {ordersRanges.map((opt) => {
          const isActive = opt.key === active;
          return (
            <button
              key={opt.key}
              role="radio"
              aria-checked={isActive}
              type="button"
              onClick={() => onSelect(opt.key)}
              className={
                "rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                (isActive
                  ? "border border-transparent bg-ink text-white"
                  : "border border-line bg-white text-ink-muted hover:text-ink")
              }
            >
              {t(opt.labelKey as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
