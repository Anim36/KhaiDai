"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { EarningsRevenuePoint } from "@/components/partner/dashboard/usePartnerEarnings";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Revenue chart (Figma `revenue-bar-chart-card`, data-node-id 4:2108).
 *
 * Recharts-driven bar chart with a daily/weekly/monthly toggle.
 *
 *   • Daily  — each point is one day (30 points from the API).
 *   • Weekly — points aggregated into 4-week buckets (~7 days each).
 *   • Monthly — single point summing the full 30-day range.
 *
 * The data array comes from the parent (which gets it from
 * `/api/partner/earnings`); this component is presentation-only.
 *
 * Recharts is a client-only library (it touches the DOM via
 * ResponsiveContainer), so this file is marked `"use client"` and the
 * parent route stays a thin Server Component.
 */
export function RevenueChart({ data }: { data: EarningsRevenuePoint[] }) {
  const t = useT();
  const [range, setRange] = useState<RangeKey>("daily");

  const aggregated = useMemo(() => aggregate(data, range), [data, range]);

  return (
    <section
      aria-label={t("partner.earnings.chart.title")}
      className="flex flex-col gap-6 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {t("partner.earnings.chart.title")}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {t("partner.earnings.chart.subtitle")}
          </p>
        </div>

        {/* Range toggle — 3 pill buttons matching the Figma `toggle` */}
        <RangeToggle value={range} onChange={setRange} />
      </header>

      {/* Recharts ResponsiveContainer fills the panel width; explicit
          height keeps the proportions sane on phones. When there's no
          daily-revenue data yet, render an honest empty-state instead
          of a chart full of zero-height bars. */}
      {aggregated.length === 0 || aggregated.every((p) => p.amount === 0) ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="font-display text-[14px] font-extrabold text-ink">
            {t("partner.earnings.chart.noData")}
          </span>
          <p className="max-w-xs text-[12px] text-ink-muted">
            —
          </p>
        </div>
      ) : (
        <div className="h-[260px] w-full md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={aggregated}
              margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              barCategoryGap={18}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f1f5f9"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                interval={range === "daily" ? 2 : 0}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                width={48}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 77, 48, 0.06)" }}
                content={<RevenueTooltip />}
              />
              <Bar
                dataKey="amount"
                fill="#ff4d30"
                radius={[8, 8, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Range toggle                                                              */
/* -------------------------------------------------------------------------- */

type RangeKey = "daily" | "weekly" | "monthly";

const RANGE_OPTIONS: Array<{ key: RangeKey; labelKey: string }> = [
  { key: "daily", labelKey: "partner.analytics.dateRange.today" },
  { key: "weekly", labelKey: "partner.analytics.dateRange.thisWeek" },
  { key: "monthly", labelKey: "partner.analytics.dateRange.thisMonth" },
];

function RangeToggle({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}) {
  const t = useT();
  return (
    <div
      role="tablist"
      aria-label={t("partner.analytics.dateRange.label")}
      className="inline-flex items-center rounded-xl border border-line bg-surface p-1"
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={
              "rounded-[10px] px-4 py-2 text-[12px] font-semibold transition-colors " +
              (active
                ? "bg-white text-ink"
                : "text-ink-muted hover:text-ink")
            }
          >
            {t(opt.labelKey as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Aggregation + tooltip                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Bucket `points` into the requested range. Weekly aggregation groups
 * every 7 consecutive days; monthly collapses the whole 30-day window
 * into one "30 days" bucket.
 */
function aggregate(
  points: EarningsRevenuePoint[],
  range: RangeKey,
): EarningsRevenuePoint[] {
  if (range === "daily") return points;

  if (range === "weekly") {
    const buckets: EarningsRevenuePoint[][] = [];
    for (let i = 0; i < points.length; i += 7) {
      buckets.push(points.slice(i, i + 7));
    }
    return buckets.map((b, i) => ({
      date: b[0]?.date ?? "",
      label: `Week ${i + 1}`,
      amount: b.reduce((sum, p) => sum + p.amount, 0),
    }));
  }

  // monthly — single bucket for the displayed window
  return [
    {
      date: points[0]?.date ?? "",
      label: "Last 30 days",
      amount: points.reduce((sum, p) => sum + p.amount, 0),
    },
  ];
}

/**
 * Custom tooltip — white rounded card with brand-coloured amount.
 * Recharts passes a `payload` of the active data point + the chart
 * `label` (which we've used for the x-axis bucket name).
 */
function RevenueTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 shadow-md">
      <span className="block text-[11px] font-semibold text-ink-muted">
        {label}
      </span>
      <span className="block text-[14px] font-extrabold text-brand">
        ৳{Number(value).toLocaleString("en-IN")}
      </span>
    </div>
  );
}
