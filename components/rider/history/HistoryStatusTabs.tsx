"use client";

import { historyTabs, type HistoryTabKey } from "@/data/rider-history";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Filter pills above the history list — same visual language as
 * the partner orders tab:
 *   • Active tab — brand-red ExtraBold white pill.
 *   • Inactive   — white Medium ink-muted pill with line border.
 *   • Each tab   — count badge so the rider can see the bucket
 *                   size at a glance.
 *
 * The active key + counts come in via props so the page-level
 * orchestrator owns the data + selection. Tab labels are resolved
 * via `rider.history.tabs.{key}` so they switch with the locale.
 */
export function HistoryStatusTabs({
  active,
  counts,
  onSelect,
}: {
  active: HistoryTabKey;
  counts: Record<HistoryTabKey, number>;
  onSelect: (key: HistoryTabKey) => void;
}) {
  const t = useT();
  return (
    <nav
      role="tablist"
      aria-label={t("rider.history.tabsAria")}
      className="flex flex-wrap items-start gap-2 w-full"
    >
      {historyTabs.map((tab) => {
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
            <span>{t(`rider.history.tabs.${tab.key}`)}</span>
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
