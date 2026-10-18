"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "@/data/rider-earnings";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * 14-day earnings chart (Recharts LineChart).
 *
 * Visual language matches the rest of the design system:
 *   • Brand-red `#ff4d30` stroke for the line (matches CTAs).
 *   • Soft `#fff5f3` area fill under the line for the "hero"
 *     feel without overwhelming the card.
 *   • `#e5e7eb` (line) gridlines + ink-muted axis labels.
 *   • 12px corner-radius card to match every other panel.
 *
 * Two range toggle pills (7 days / 14 days) sit above the chart
 * and slice the series accordingly. The tooltip is custom — a
 * small white card with the full date label + earnings + delivery
 * count, so it matches the rest of the UI's typography exactly.
 *
 * The chart container uses `ResponsiveContainer` so it fills its
 * parent and shrinks gracefully on mobile.
 */
export function EarningsChart({ data }: { data: ChartPoint[] }) {
  const t = useT();
  const [range, setRange] = useState<"7d" | "14d">("14d");
  const sliced =
    range === "7d" ? data.slice(-7) : data;

  return (
    <section
      aria-label={t("rider.earnings.chartAria")}
      data-chart="earnings"
      data-range={range}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {t("rider.earnings.chartTitle")}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {t("rider.earnings.chartSubtitle")}
          </p>
        </div>

        <div
          role="tablist"
          aria-label={t("rider.earnings.rangeTab")}
          className="flex items-center rounded-xl bg-surface p-1"
        >
          {(["7d", "14d"] as const).map((key) => {
            const active = key === range;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRange(key)}
                className={
                  "rounded-[10px] px-4 py-2 text-[12px] transition-colors " +
                  (active
                    ? "bg-white font-bold text-brand shadow-sm"
                    : "font-medium text-ink-muted hover:text-ink")
                }
              >
                {key === "7d"
                  ? t("rider.earnings.range7d")
                  : t("rider.earnings.range14d")}
              </button>
            );
          })}
        </div>
      </header>

      <div className="h-[260px] w-full md:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={sliced}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="earnings-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff4d30" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#ff4d30" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="#9ca3af"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => "৳" + v}
              width={56}
            />

            <Tooltip
              cursor={{ stroke: "#ff4d30", strokeDasharray: "3 3" }}
              content={<ChartTooltip />}
            />

            <Line
              type="monotone"
              dataKey="earnings"
              stroke="#ff4d30"
              strokeWidth={3}
              dot={{ r: 4, fill: "#ff4d30", stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#ff4d30", stroke: "#fff", strokeWidth: 3 }}
              fill="url(#earnings-area)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Custom tooltip                                                            */
/* -------------------------------------------------------------------------- */

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  // Recharts types the payload loosely — we only need `payload[0].payload`.
  payload?: Array<{ payload: ChartPoint }>;
}) {
  const t = useT();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 shadow-md">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {point.fullDate}
        </span>
        <span className="font-display text-[15px] font-extrabold text-ink">
          ৳{point.earnings}
        </span>
        <span className="text-[11px] font-normal text-ink-muted">
          {t("rider.earnings.tooltipDeliveries_other", { n: point.deliveries })}
        </span>
      </div>
    </div>
  );
}
