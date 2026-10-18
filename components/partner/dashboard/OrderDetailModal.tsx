"use client";

import { useEffect } from "react";
import { OrderStatusPill } from "@/components/partner/dashboard/OrderStatusPill";
import type { Order } from "@/data/partner-orders";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Order detail modal — opened from the orders table when the
 * partner taps a row.
 */
export function OrderDetailModal({
  order,
  pending,
  onAccept,
  onReject,
  onReady,
  onClose,
}: {
  order: Order | null;
  pending?: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onReady: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  if (!order) return null;

  const isNew = order.status === "new";
  const isPreparing = order.status === "preparing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-white p-6 flex flex-col gap-5 shadow-xl">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {t("partner.orders.columns.orderId")}
            </span>
            <h2
              id="order-detail-title"
              className="font-display text-[22px] font-extrabold text-ink"
            >
              {order.shortId}
            </h2>
            <span className="text-[12px] text-ink-muted">
              {order.placedAtLabel}
            </span>
          </div>
          <OrderStatusPill status={order.status} />
        </header>

        <div className="h-px w-full bg-line" aria-hidden />

        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("partner.orders.modal.customer")}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DetailRow label={t("partner.orders.modal.customer")} value={order.customerName} />
            <DetailRow label={t("partner.orders.modal.phone")} value={order.customerPhone} />
            <DetailRow
              label={t("partner.orders.modal.address")}
              value={order.customerAddress}
              className="md:col-span-2"
            />
          </div>
        </section>

        {order.specialInstructions ? (
          <section
            role="note"
            className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
              {t("partner.orders.modal.specialInstructions")}
            </span>
            <p className="text-[13px] leading-snug">
              {order.specialInstructions}
            </p>
          </section>
        ) : null}

        <div className="h-px w-full bg-line" aria-hidden />

        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("partner.orders.modal.itemsHeading")}
          </h3>
          <ul className="flex flex-col gap-2">
            {order.items.map((item, idx) => (
              <li
                key={`${order.id}-item-${idx}`}
                className="flex items-center justify-between text-[14px]"
              >
                <span className="text-ink">
                  <span className="font-semibold">{item.qty}×</span>{" "}
                  {item.name}
                </span>
                <span className="font-semibold text-ink-muted">
                  {item.price}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-[14px] font-semibold text-ink-muted">
              {t("partner.orders.modal.total")}
            </span>
            <span className="font-display text-[18px] font-extrabold text-brand">
              {order.total}
            </span>
          </div>
        </section>

        <div className="h-px w-full bg-line" aria-hidden />

        <div className="flex items-center justify-between gap-3">
          <DetailRow label="Payment Method" value={order.paymentMethod} />
          {order.paymentMethod && order.paymentMethod !== "CASH" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700">
              <span aria-hidden>✓</span> Paid
            </span>
          ) : null}
        </div>

        {isNew ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <button
              type="button"
              onClick={() => onReject(order.id)}
              disabled={pending}
              className="h-12 rounded-xl border border-line bg-white px-6 text-[14px] font-semibold text-ink hover:bg-surface disabled:opacity-50"
            >
              {t("partner.dashboard.incomingOrders.reject")}
            </button>
            <button
              type="button"
              onClick={() => onAccept(order.id)}
              disabled={pending}
              className="h-12 rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? t("partner.common.pleaseWait")
                : t("partner.dashboard.incomingOrders.accept")}
            </button>
          </div>
        ) : isPreparing ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <button
              type="button"
              onClick={() => onReady(order.id)}
              disabled={pending}
              className="h-12 rounded-xl bg-[#dcfce7] px-6 text-[14px] font-semibold text-[#16a34a] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? t("partner.common.pleaseWait")
                : t("partner.dashboard.incomingOrders.markReady")}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          ← {t("partner.orders.modal.close")}
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={"flex flex-col gap-0.5 " + (className ?? "")}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="text-[14px] text-ink">{value}</span>
    </div>
  );
}