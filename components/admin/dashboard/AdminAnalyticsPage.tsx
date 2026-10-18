"use client";

// components/admin/dashboard/AdminAnalyticsPage.tsx
//
// Feat 3 — /admin/analytics. Platform-wide analytics.
//
// Renders five panels + a header that summarises totals:
//   1. Revenue trend (Recharts line) — daily DELIVERED revenue.
//   2. Top 10 restaurants (list) — by delivered count + revenue.
//   3. Top 10 riders (list) — masked names, deliveries + earnings.
//   4. Order status funnel (Recharts bar) — counts per status.
//   5. Peak hours (Recharts bar) — DELIVERED orders by hour-of-day.
//
// Zone/area distribution is rendered as a small helper panel
// because we don't have a geocoder — we fall back to a
// keyword-cluster of the delivery-address comma-separated
// first token (e.g. "Banani, …"). A "with/without coords"
// ratio is also shown for transparency.
//
// Window selector — picks 7 / 14 / 30 / 90 days. All values
// come from `GET /api/admin/analytics?days=N`.

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { apiFetch } from "@/lib/apiClient";

type AdminAnalyticsResponse = {
  range: { from: string; to: string; days: number };
  totals: {
    orders: number;
    delivered: number;
    cancelled: number;
    revenue: number;
    customers: number;
    restaurants: number;
    riders: number;
  };
  revenueTrend: Array<{
    date: string;
    label: string;
    revenue: number;
    orders: number;
  }>;
  topRestaurants: Array<{
    restaurantId: string;
    name: string;
    deliveredCount: number;
    revenue: number;
  }>;
  topRiders: Array<{
    riderId: string;
    maskedName: string;
    deliveries: number;
    earnings: number;
  }>;
  statusFunnel: Array<{
    status: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  peakHours: Array<{ hour: number; label: string; orders: number }>;
  zoneDistribution: {
    withCoords: number;
    withoutCoords: number;
    byAddressKeyword: Array<{ keyword: string; count: number }>;
  };
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

function formatTaka(n: number): string {
  return `৳${n.toLocaleString("en-IN")}`;
}

export function AdminAnalyticsPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminAnalyticsContent />
    </RequireAuth>
  );
}

function AdminAnalyticsContent() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AdminAnalyticsResponse>(
        `/api/admin/analytics?days=${days}`,
      );
      if (!res.ok) {
        setError(res.error.message || "Could not load analytics");
        return;
      }
      if (!res.data) {
        setError("Empty response");
        return;
      }
      setData(res.data);
    } catch (e) {
      setError((e as Error).message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return (
    <AdminShell activeKey="analytics">
        <header className="flex flex-col gap-3 border-b border-line bg-white px-8 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Platform Analytics</h1>
            {data ? (
              <p className="text-sm text-ink-muted">
                {data.range.from} → {data.range.to} ({data.range.days} days)
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Loading…</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={
                  "rounded-md px-4 py-1.5 text-sm font-semibold " +
                  (days === d
                    ? "bg-brand text-white"
                    : "bg-surface text-ink hover:bg-surface-card")
                }
              >
                {d}d
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-8">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
            >
              {error}
              <button
                type="button"
                onClick={() => refresh().catch(() => {})}
                className="ml-3 underline"
              >
                Retry
              </button>
            </div>
          ) : null}

          {loading && !data ? (
            <Skeleton />
          ) : data ? (
            <>
              <Totals totals={data.totals} />
              <RevenueTrend rows={data.revenueTrend} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <TopRestaurants rows={data.topRestaurants} />
                <TopRiders rows={data.topRiders} />
              </div>
              <StatusFunnel data={data.statusFunnel} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <PeakHours rows={data.peakHours} />
                <ZoneDistribution zone={data.zoneDistribution} />
              </div>
            </>
          ) : null}
        </div>
      </AdminShell>
  );
}

function Totals({
  totals,
}: {
  totals: AdminAnalyticsResponse["totals"];
}) {
  const cards = [
    { label: "Orders", value: totals.orders.toLocaleString("en-IN"), hint: `${totals.delivered} delivered` },
    {
      label: "Revenue",
      value: formatTaka(totals.revenue),
      hint: `${totals.cancelled} cancelled`,
    },
    {
      label: "Customers",
      value: totals.customers.toLocaleString("en-IN"),
      hint: `${totals.restaurants} restaurants`,
    },
    {
      label: "Riders",
      value: totals.riders.toLocaleString("en-IN"),
      hint: `${totals.restaurants} restaurants`,
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
          <div className="mt-1 text-xs text-ink-muted">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}

function RevenueTrend({
  rows,
}: {
  rows: AdminAnalyticsResponse["revenueTrend"];
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">Daily Revenue</h2>
        <p className="text-xs text-ink-muted">
          Platform-wide DELIVERED revenue, oldest → newest
        </p>
      </header>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#6b7280" }}
              tickFormatter={(v) => `৳${v}`}
            />
            <Tooltip
              formatter={(v: number) => formatTaka(v)}
              labelStyle={{ color: "#111827" }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TopRestaurants({
  rows,
}: {
  rows: AdminAnalyticsResponse["topRestaurants"];
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">Top 10 Restaurants</h2>
        <p className="text-xs text-ink-muted">
          Ranked by DELIVERED order count
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No delivered orders yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={r.restaurantId}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="font-semibold text-ink">{r.name}</span>
              </span>
              <span className="flex items-center gap-4 text-ink-muted">
                <span>{r.deliveredCount} orders</span>
                <span className="font-bold text-ink">
                  {formatTaka(r.revenue)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TopRiders({
  rows,
}: {
  rows: AdminAnalyticsResponse["topRiders"];
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">Top 10 Riders</h2>
        <p className="text-xs text-ink-muted">
          Privacy-masked names, ranked by DELIVERED count
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No rider deliveries yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={r.riderId}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="font-semibold text-ink">{r.maskedName}</span>
              </span>
              <span className="flex items-center gap-4 text-ink-muted">
                <span>{r.deliveries} deliveries</span>
                <span className="font-bold text-ink">
                  {formatTaka(r.earnings)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StatusFunnel({
  data,
}: {
  data: AdminAnalyticsResponse["statusFunnel"];
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">Order Status Funnel</h2>
        <p className="text-xs text-ink-muted">
          Platform-wide in the selected window
        </p>
      </header>
      {data.length === 0 ? (
        <p className="text-sm text-ink-muted">No orders in this window.</p>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} />
              <Tooltip
                formatter={(v: number, _name, p) => {
                  const pct = (p?.payload?.percentage ?? 0) as number;
                  return [`${v} (${pct.toFixed(1)}%)`, "orders"];
                }}
              />
              <Bar dataKey="count">
                {data.map((row) => (
                  <Cell
                    key={row.status}
                    fill={STATUS_COLOURS[row.status] ?? "#9ca3af"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function PeakHours({
  rows,
}: {
  rows: AdminAnalyticsResponse["peakHours"];
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">Peak Hours</h2>
        <p className="text-xs text-ink-muted">
          DELIVERED orders by hour of day (UTC)
        </p>
      </header>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} />
            <Tooltip formatter={(v: number) => `${v} orders`} />
            <Bar dataKey="orders" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ZoneDistribution({
  zone,
}: {
  zone: AdminAnalyticsResponse["zoneDistribution"];
}) {
  const total = zone.withCoords + zone.withoutCoords;
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">Area Distribution</h2>
        <p className="text-xs text-ink-muted">
          Approximate — clusters the first token of the address (no geocoder)
        </p>
      </header>
      <div className="mb-3 text-sm text-ink">
        {zone.withCoords} of {total} delivered orders carry usable delivery
        coordinates
      </div>
      {zone.byAddressKeyword.length === 0 ? (
        <p className="text-sm text-ink-muted">No address data.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {zone.byAddressKeyword.map((z, i) => (
            <li
              key={z.keyword}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="font-semibold text-ink">{z.keyword}</span>
              </span>
              <span className="text-ink-muted">{z.count} orders</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div
      role="status"
      className="flex flex-col gap-6"
      aria-label="Loading analytics"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[110px] animate-pulse rounded-xl border border-line bg-white"
          />
        ))}
      </div>
      <div className="h-[340px] animate-pulse rounded-xl border border-line bg-white" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="h-[260px] animate-pulse rounded-xl border border-line bg-white" />
        <div className="h-[260px] animate-pulse rounded-xl border border-line bg-white" />
      </div>
    </div>
  );
}