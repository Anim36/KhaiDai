"use client";

import { CheckIcon, RiderScooterIcon, WalletIcon } from "@/components/icons";
import type { TodaySummary } from "@/data/rider-dashboard";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Bottom-of-page "Today's summary" card.
 *
 * Three stat tiles in a single rounded card:
 *   • Deliveries today  (count + sub label)
 *   • Earnings today    (BDT + sub label)
 *   • Hours online      (duration + sub label)
 *
 * Below the tiles a 1-line human headline. Figma spec layout —
 * rounded card, 24px padding, 24px vertical gap between sections.
 */
export function TodaySummaryCard({ summary }: { summary: TodaySummary }) {
  const t = useT();
  return (
    <section
      aria-label={t("rider.dashboard.summary.aria")}
      className="flex flex-col gap-6 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.dashboard.summary.title")}
        </h2>
        <span className="text-[12px] text-ink-muted">
          {t("rider.dashboard.summary.resetsAt")}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          icon={<CheckIcon size={18} />}
          tint="brand"
          label={t("rider.dashboard.summary.deliveries")}
          value={String(summary.deliveries)}
          sub={t("rider.dashboard.summary.deliveriesSub")}
        />
        <Stat
          icon={<WalletIcon size={18} />}
          tint="amber"
          label={t("rider.dashboard.summary.earnings")}
          value={summary.earnings}
          sub={t("rider.dashboard.summary.earningsSub")}
        />
        <Stat
          icon={<RiderScooterIcon size={18} />}
          tint="green"
          label={t("rider.dashboard.summary.hoursOnline")}
          value={summary.hoursOnline}
          sub={t("rider.dashboard.summary.hoursOnlineSub")}
        />
      </div>

      <p className="rounded-xl bg-surface px-4 py-3 text-[13px] font-medium text-ink">
        {summary.deliveries === 0
          ? t("rider.dashboard.summary.noDeliveriesToday")
          : t("rider.dashboard.summary.deliveriesCount_other", {
              n: summary.deliveries,
            })}
      </p>
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