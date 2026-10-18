"use client";

import {
  CheckIcon,
  ChevronUpIcon,
  ClockIcon,
  RiderScooterIcon,
  WalletIcon,
} from "@/components/icons";
import type { EarningsSummary } from "@/data/rider-earnings";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Top-of-page hero card for the rider earnings page.
 *
 *   • Big BDT number (today's earnings) with a brand-tinted
 *     "▲ +12% vs yesterday" pill when today's earnings are higher
 *     than yesterday's.
 *   • 4-cell stat strip below: deliveries today, hours online,
 *     avg per trip, incentive bonus. Each cell has a tinted
 *     leading icon in the same language as the dashboard's
 *     TodaySummaryCard.
 *
 * The card uses a soft brand-tinted gradient background so the
 * page reads as the headline block; everything else (chart +
 * history) sits on the plain `#f9fafb` page bg.
 */
export function EarningsSummaryCard({ summary }: { summary: EarningsSummary }) {
  const t = useT();
  const deltaPct =
    summary.yesterdayRaw > 0
      ? Math.round(
          ((summary.todayRaw - summary.yesterdayRaw) /
            summary.yesterdayRaw) *
            100,
        )
      : 0;
  const deltaPositive = summary.todayRaw >= summary.yesterdayRaw;

  return (
    <section
      aria-label={t("rider.earnings.summaryAria")}
      className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 md:p-8"
    >
      {/* Soft brand gradient — adds a "hero" feel without competing with the chart. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#fff5f3] via-white to-white"
      />

      <div className="relative flex flex-col gap-6">
        {/* Big number + delta pill */}
        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("rider.earnings.summaryTitle")}
          </span>
          <div className="flex flex-wrap items-end gap-4">
            <span className="font-display text-[40px] font-extrabold leading-none text-ink md:text-[52px]">
              {summary.today}
            </span>
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold " +
                (deltaPositive
                  ? "bg-[#dcfce7] text-[#16a34a]"
                  : "bg-[#fef2f2] text-rose-500")
              }
            >
              <ChevronUpIcon
                size={12}
                className={
                  deltaPositive ? "rotate-0" : "rotate-180"
                }
              />
              {deltaPositive ? "+" : ""}
              {deltaPct}% {t("rider.earnings.deltaVsYesterday")}
            </span>
          </div>
        </div>

        {/* 4-cell stat strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            icon={<CheckIcon size={16} />}
            tint="brand"
            label={t("rider.earnings.deliveries")}
            value={String(summary.deliveries)}
            sub={t("rider.earnings.deliveriesSub")}
          />
          <Stat
            icon={<ClockIcon size={16} />}
            tint="green"
            label={t("rider.earnings.hoursOnline")}
            value={summary.hoursOnline}
            sub={t("rider.earnings.hoursOnlineSub")}
          />
          <Stat
            icon={<RiderScooterIcon size={16} />}
            tint="amber"
            label={t("rider.earnings.perTrip")}
            value={summary.perTrip}
            sub={t("rider.earnings.perTripSub")}
          />
          <Stat
            icon={<WalletIcon size={16} />}
            tint="brand"
            label={t("rider.earnings.incentive")}
            value={summary.incentive}
            sub={t("rider.earnings.incentiveSub")}
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat tile                                                                 */
/* -------------------------------------------------------------------------- */

const tintClasses = {
  brand: { bg: "bg-[#fff5f3]", text: "text-brand" },
  amber: { bg: "bg-[#fff7e6]", text: "text-[#f59e0b]" },
  green: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
} as const;

function Stat({
  icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  tint: keyof typeof tintClasses;
  label: string;
  value: string;
  sub: string;
}) {
  const t = tintClasses[tint];
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-4">
      <span
        className={
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
          t.bg +
          " " +
          t.text
        }
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className="font-display text-[18px] font-extrabold text-ink">
          {value}
        </span>
        <span className="text-[11px] font-normal text-ink-muted">{sub}</span>
      </div>
    </div>
  );
}
