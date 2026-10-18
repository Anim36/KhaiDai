"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

type RangePreset = "today" | "week" | "month" | "custom";

type AnalyticsResponse = {
  range: { from: string; to: string };
  restaurants: Array<{ id: string; name: string }>;
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    busiestDay: { date: string; label: string; orders: number } | null;
    busiestHour: { hour: number; label: string; orders: number } | null;
  };
  dailyRevenue: Array<{ date: string; label: string; revenue: number; orders: number }>;
  topItems: Array<{
    menuItemId: string;
    name: string;
    quantitySold: number;
    revenue: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    label: string;
    count: number;
    percentage: number;
  }>;
};

const STATUS_COLOURS: Record<string, string> = {
  PENDING: "#9ca3af",
  PREPARING: "#3b82f6",
  READY: "#0ea5e9",
  PICKED_UP: "#f59e0b",
  ON_THE_WAY: "#a855f7",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
  OFFERED_TO_RIDER: "#6366f1",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const today = new Date();
  const end = isoDate(today);
  const start = new Date(today);
  if (preset === "today") {
    // same day
  } else if (preset === "week") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "month") {
    start.setDate(start.getDate() - 29);
  } else {
    start.setDate(start.getDate() - 29);
  }
  return { from: isoDate(start), to: end };
}

function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("en-IN")}`;
}

export function PartnerAnalyticsPage() {
  return (
    <RequireAuth role="PARTNER">
      <PartnerAnalyticsContent />
    </RequireAuth>
  );
}

function PartnerAnalyticsContent() {
  const t = useT();
  const [preset, setPreset] = useState<RangePreset>("month");
  const [from, setFrom] = useState<string>(() => rangeForPreset("month").from);
  const [to, setTo] = useState<string>(() => rangeForPreset("month").to);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await apiFetch<AnalyticsResponse>(
        `/api/partner/analytics?${qs.toString()}`,
      );
      if (!res.ok) {
        setError(res.error.message || t("partner.common.loadFailed"));
        setData(null);
        return;
      }
      if (!res.data) {
        setError(t("partner.common.loadFailed"));
        setData(null);
        return;
      }
      setData(res.data);
    } catch (e) {
      setError((e as Error).message ?? t("partner.common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  function applyPreset(next: RangePreset) {
    setPreset(next);
    if (next !== "custom") {
      const r = rangeForPreset(next);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  function handleExportCsv() {
    if (!data) return;
    const lines: string[] = [];
    lines.push("# Partner analytics export");
    lines.push(`# Restaurant(s): ${data.restaurants.map((r) => r.name).join(", ")}`);
    lines.push(`# Range: ${data.range.from} → ${data.range.to}`);
    lines.push("");
    lines.push("Summary");
    lines.push("metric,value");
    lines.push(`Total orders,${data.summary.totalOrders}`);
    lines.push(`Total revenue,${data.summary.totalRevenue}`);
    lines.push(`Average order value,${data.summary.averageOrderValue}`);
    lines.push(
      `Busiest day,${data.summary.busiestDay ? `${data.summary.busiestDay.label} (${data.summary.busiestDay.orders})` : "-"}`,
    );
    lines.push(
      `Busiest hour,${data.summary.busiestHour ? `${data.summary.busiestHour.label} (${data.summary.busiestHour.orders})` : "-"}`,
    );
    lines.push("");
    lines.push("Daily breakdown");
    lines.push("date,label,orders,revenue");
    for (const d of data.dailyRevenue) {
      lines.push(`${d.date},${d.label},${d.orders},${d.revenue}`);
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `partner-analytics_${data.range.from}_${data.range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <PartnerShell activeKey="analytics">
        <header className="flex flex-col gap-3 border-b border-line bg-white px-8 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">{t("partner.analytics.title")}</h1>
            <p className="text-sm text-ink-muted">
              {t("partner.analytics.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!data}
              className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
            >
              {t("partner.analytics.export.button")}
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-8">
          <RangePicker
            preset={preset}
            from={from}
            to={to}
            onPreset={applyPreset}
            onCustom={(f, t) => {
              setPreset("custom");
              setFrom(f);
              setTo(t);
            }}
          />

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand"
            >
              {error}
              <button
                type="button"
                onClick={() => refresh().catch(() => {})}
                className="ml-3 underline"
              >
                {t("partner.common.retry")}
              </button>
            </div>
          ) : null}

          {loading && !data ? (
            <Skeleton />
          ) : data ? (
            <>
              <SummaryCards summary={data.summary} />
              <RevenueChart rows={data.dailyRevenue} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <TopItemsList items={data.topItems} />
                <StatusBreakdownPie data={data.statusBreakdown} />
              </div>
            </>
          ) : null}
        </div>
      </PartnerShell>
  );
}

function RangePicker({
  preset,
  from,
  to,
  onPreset,
  onCustom,
}: {
  preset: RangePreset;
  from: string;
  to: string;
  onPreset: (p: RangePreset) => void;
  onCustom: (from: string, to: string) => void;
}) {
  const t = useT();
  const presets: Array<{ key: RangePreset; label: string }> = [
    { key: "today", label: t("partner.analytics.dateRange.today") },
    { key: "week", label: t("partner.analytics.dateRange.thisWeek") },
    { key: "month", label: t("partner.analytics.dateRange.thisMonth") },
    { key: "custom", label: t("partner.analytics.dateRange.custom") },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPreset(p.key)}
            className={
              "rounded-md px-4 py-1.5 text-sm font-semibold " +
              (preset === p.key
                ? "bg-brand text-white"
                : "bg-surface text-ink hover:bg-surface-card")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <label className="flex items-center gap-2">
          {t("partner.analytics.charts.xAxis")}
          <input
            type="date"
            value={from}
            onChange={(e) => onCustom(e.target.value, to)}
            className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="flex items-center gap-2">
          {t("partner.analytics.charts.xAxis")}
          <input
            type="date"
            value={to}
            onChange={(e) => onCustom(from, e.target.value)}
            className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
      </div>
    </div>
  );
}

function SummaryCards({
  summary,
}: {
  summary: AnalyticsResponse["summary"];
}) {
  const t = useT();
  const cards = [
    {
      label: t("partner.analytics.summary.totalOrders"),
      value: summary.totalOrders.toLocaleString("en-IN"),
      hint: "—",
    },
    {
      label: t("partner.analytics.summary.totalRevenue"),
      value: formatTaka(summary.totalRevenue),
      hint: "—",
    },
    {
      label: t("partner.analytics.summary.avgOrder"),
      value: formatTaka(summary.averageOrderValue),
      hint: "—",
    },
    {
      label: t("partner.analytics.summary.uniqueCustomers"),
      value: summary.busiestDay
        ? `${summary.busiestDay.label} · ${summary.busiestHour?.label ?? "—"}`
        : "—",
      hint: "—",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-line bg-white p-5"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {c.label}
          </div>
          <div className="mt-2 text-2xl font-bold text-ink">{c.value}</div>
          {c.hint ? (
            <div className="mt-1 text-xs text-ink-muted">{c.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RevenueChart({
  rows,
}: {
  rows: AnalyticsResponse["dailyRevenue"];
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">{t("partner.earnings.chart.title")}</h2>
        <p className="text-xs text-ink-muted">
          {t("partner.earnings.chart.subtitle")}
        </p>
      </header>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <YAxis
              tick={{ fontSize: 12, fill: "#6b7280" }}
              tickFormatter={(v) => `৳${v}`}
            />
            <Tooltip
              formatter={(v: number) => formatTaka(v)}
              labelStyle={{ color: "#111827" }}
            />
            <Bar dataKey="revenue" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TopItemsList({
  items,
}: {
  items: AnalyticsResponse["topItems"];
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">{t("partner.analytics.topItems.title")}</h2>
        <p className="text-xs text-ink-muted">
          {t("partner.analytics.topItems.subtitle")}
        </p>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {t("partner.analytics.topItems.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={it.menuItemId}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="font-semibold text-ink">{it.name}</span>
              </span>
              <span className="flex items-center gap-4 text-ink-muted">
                <span>{it.quantitySold}</span>
                <span className="font-bold text-ink">
                  {formatTaka(it.revenue)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StatusBreakdownPie({
  data,
}: {
  data: AnalyticsResponse["statusBreakdown"];
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">{t("partner.dashboard.incomingOrders.title")}</h2>
        <p className="text-xs text-ink-muted">
          {t("partner.orders.subtitle")}
        </p>
      </header>
      {data.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("partner.orders.empty")}</p>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={(d) =>
                  `${d.label} ${typeof d.percentage === "number" ? Math.round(d.percentage) : 0}%`
                }
                labelLine={false}
              >
                {data.map((row) => (
                  <Cell
                    key={row.status}
                    fill={STATUS_COLOURS[row.status] ?? "#9ca3af"}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, _name, p) => {
                  const pct = (p?.payload?.percentage ?? 0) as number;
                  return [`${v} (${pct.toFixed(1)}%)`, "orders"];
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function Skeleton() {
  const t = useT();
  return (
    <div
      role="status"
      className="flex flex-col gap-6"
      aria-label={t("partner.common.pleaseWait")}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[110px] animate-pulse rounded-xl border border-line bg-white"
          />
        ))}
      </div>
      <div className="h-[320px] animate-pulse rounded-xl border border-line bg-white" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="h-[280px] animate-pulse rounded-xl border border-line bg-white" />
        <div className="h-[280px] animate-pulse rounded-xl border border-line bg-white" />
      </div>
    </div>
  );
}