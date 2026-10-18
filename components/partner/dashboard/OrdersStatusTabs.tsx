"use client";

import { ordersTabs, type OrdersTabKey } from "@/data/partner-orders";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Status filter pills above the orders table.
 */
export function OrdersStatusTabs({
  active,
  counts,
  onSelect,
}: {
  active: OrdersTabKey;
  counts: Record<OrdersTabKey, number>;
  onSelect: (key: OrdersTabKey) => void;
}) {
  const t = useT();
  return (
    <nav
      role="tablist"
      aria-label={t("partner.orders.title")}
      className="flex flex-wrap items-start gap-2 w-full"
    >
      {ordersTabs.map((tab) => {
        const isActive = tab.key === active;
        const count = counts[tab.key] ?? 0;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={
              "shrink-0 rounded-xl px-[18px] py-[10px] text-[11px] transition-colors " +
              (isActive
                ? "bg-brand font-extrabold text-white border border-transparent"
                : "bg-white font-medium text-ink-muted border border-line hover:text-ink")
            }
          >
            <span>{t(tab.labelKey as Parameters<typeof t>[0])}</span>
            <span
              className={
                "ml-2 inline-flex items-center justify-center rounded-full px-2 text-[10px] font-bold " +
                (isActive
                  ? "bg-white/20 text-white"
                  : "bg-surface text-ink-muted")
              }
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}