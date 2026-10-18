"use client";

import {
  orderStatusMeta,
  type OrderStatus,
} from "@/data/partner-dashboard";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Status pill (Figma `status-pill` frame).
 *
 * Colour mapping is owned by `orderStatusMeta` in the data file so the
 * same colour codes can be reused by the orders panel and any future
 * place that needs to render a status (e.g. an analytics table).
 *
 * Pill geometry: 20px radius, 12px horizontal / 6px vertical padding —
 * matches the Figma spec exactly.
 */
export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const t = useT();
  const meta = orderStatusMeta[status];
  return (
    <span
      data-status={status}
      className={
        "inline-flex items-center whitespace-nowrap rounded-[20px] px-3 py-1.5 text-[12px] font-semibold " +
        meta.classes.bg +
        " " +
        meta.classes.text
      }
    >
      {t(meta.labelKey as Parameters<typeof t>[0])}
    </span>
  );
}
