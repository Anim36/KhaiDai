"use client";

import { OrderStatusPill } from "@/components/partner/dashboard/OrderStatusPill";
import type { Order } from "@/data/partner-orders";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Orders list (full-page version of the dashboard's incoming-orders
 * panel).
 */
export function OrdersTable({
  orders,
  totalOrders,
  onOpen,
}: {
  orders: Order[];
  totalOrders: number;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  if (orders.length === 0) {
    const isSystemEmpty = totalOrders === 0;
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
        <span className="font-display text-[16px] font-extrabold text-ink">
          {isSystemEmpty ? t("orders.empty") : t("partner.orders.empty")}
        </span>
        <p className="max-w-xs text-[13px] text-ink-muted">
          {isSystemEmpty
            ? "—"
            : "—"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="hidden gap-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[110px_1.4fr_2fr_120px_220px_1.4fr]">
        <span>{t("partner.orders.columns.orderId")}</span>
        <span>{t("partner.orders.columns.customer")}</span>
        <span>{t("partner.orders.columns.items")}</span>
        <span>{t("partner.orders.columns.total")}</span>
        <span>{t("partner.orders.columns.status")}</span>
        <span>{t("partner.orders.columns.placedAt")}</span>
      </div>

      <ul className="flex flex-col gap-3">
        {orders.map((order) => (
          <li key={order.id}>
            <OrderRow order={order} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderRow({
  order,
  onOpen,
}: {
  order: Order;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onOpen(order.id)}
      data-order-id={order.id}
      data-order-status={order.status}
      aria-label={`${t("partner.orders.viewDetails")} ${order.shortId}`}
      className="grid w-full grid-cols-1 gap-y-3 rounded-2xl border border-line bg-white p-4 text-left transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:grid-cols-[110px_1.4fr_2fr_120px_220px_1.4fr] md:items-center md:gap-3"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("partner.orders.columns.orderId")}
        </span>
        <span className="font-display text-[14px] font-extrabold text-ink">
          {order.shortId}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("partner.orders.columns.customer")}
        </span>
        <span className="text-[14px] font-semibold text-ink truncate">
          {order.customerName}
        </span>
        <span className="text-[12px] text-ink-muted truncate">
          {order.customerPhone}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("partner.orders.columns.items")}
        </span>
        <span className="text-[13px] text-ink truncate">
          {order.itemsSummary}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("partner.orders.columns.total")}
        </span>
        <span className="font-display text-[14px] font-extrabold text-brand">
          {order.total}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("partner.orders.columns.status")}
        </span>
        <div className="flex items-center gap-2">
          <OrderStatusPill status={order.status} />
          {/* Bug-1 fix — a small "Paid Online" badge so the partner
              can distinguish prepaid orders from COD without
              opening the detail modal. We treat anything that isn't
              CASH as a gateway-paid order; "PAID" gateway status
              isn't required for the badge because we only get here
              if the order was placed through /api/orders (which
              means a successful init returned a gatewayPageURL). */}
          {order.paymentMethod && order.paymentMethod !== "CASH" ? (
            <span
              data-paid-online="true"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
              aria-label="Paid Online"
            >
              <span aria-hidden>✓</span>
              {t("partner.orders.paidOnline")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("partner.orders.columns.placedAt")}
        </span>
        <span className="text-[12px] text-ink-muted">
          {order.placedAtLabel}
        </span>
      </div>
    </button>
  );
}