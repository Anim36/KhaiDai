"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { AdminDashboardHeader } from "@/components/admin/dashboard/AdminDashboardHeader";
import { apiFetch } from "@/lib/apiClient";

/**
 * Orchestrator for /admin/dashboard.
 *
 * Loads `/api/admin/overview` once on mount + every time the
 * Refresh button is pressed. The page is split into four panels:
 *   • MetricCardsRow — 4 big numbers (users / restaurants / orders / revenue)
 *   • OrderTrendChart — Recharts bar chart of last 7 days
 *   • StatusBreakdown — small chips for order counts by status
 *   • RecentOrdersTable — last 10 orders, click → detail
 *
 * RequireAuth(role="ADMIN") redirects anyone without an ADMIN
 * session to /admin/login.
 */
export function AdminDashboardPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminDashboardContent />
    </RequireAuth>
  );
}

type OverviewResponse = {
  userCounts: {
    customer: number;
    partner: number;
    rider: number;
    admin: number;
    total: number;
  };
  restaurantCount: number;
  orderCounts: Record<string, number>;
  totalRevenue: number;
  recentOrders: Array<{
    id: string;
    status: string;
    statusLabel: string;
    total: number;
    customerName: string;
    restaurantName: string;
    riderName: string | null;
    placedAt: string;
  }>;
  orderTrend: Array<{ date: string; count: number }>;
  ridersOnline: { online: number; total: number };
  /** ধাপ ৬ — combined PENDING count of restaurants + riders. */
  pendingVerifications: number;
};

type DashboardState =
  | { kind: "loading" }
  | { kind: "ready"; data: OverviewResponse; loadedAt: Date }
  | { kind: "error"; message: string };

function AdminDashboardContent() {
  const [state, setState] = useState<DashboardState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isReload = state.kind === "ready";
    if (isReload) setRefreshing(true);

    async function load() {
      const res = await apiFetch<OverviewResponse>("/api/admin/overview");
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "error", message: res.error.message });
        setRefreshing(false);
        return;
      }
      setState({
        kind: "ready",
        data: res.data,
        loadedAt: new Date(),
      });
      setRefreshing(false);
    }

    load().catch((err) => {
      if (cancelled) return;
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load overview",
      });
      setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
    // We deliberately omit `state.kind` from the dep array — we only
    // want the effect to re-run on `reloadKey` (or first mount), not
    // on every state mutation it triggers. This avoids a feedback
    // loop where setting state would re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return (
    <AdminShell activeKey="dashboard">
      <AdminDashboardHeader
        loadedAt={state.kind === "ready" ? state.loadedAt : null}
        onRefresh={reload}
        refreshing={refreshing}
      />
      <div className="flex flex-1 flex-col gap-6 p-8">
        {state.kind === "loading" ? (
          <DashboardSkeleton />
        ) : state.kind === "error" ? (
          <div
            role="alert"
            className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
          >
            {state.message}
          </div>
        ) : (
          <ReadyDashboard data={state.data} />
        )}
      </div>
    </AdminShell>
  );
}

function ReadyDashboard({ data }: { data: OverviewResponse }) {
  return (
    <>
      <MetricCardsRow
        userCount={data.userCounts.total}
        restaurantCount={data.restaurantCount}
        orderCount={data.orderCounts.total}
        revenue={data.totalRevenue}
        ridersOnline={data.ridersOnline}
        pendingVerifications={data.pendingVerifications}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <OrderTrendChart trend={data.orderTrend} />
        <StatusBreakdown counts={data.orderCounts} />
      </div>
      <RecentOrdersTable orders={data.recentOrders} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Metric cards                                                               */
/* -------------------------------------------------------------------------- */

function MetricCardsRow({
  userCount,
  restaurantCount,
  orderCount,
  revenue,
  ridersOnline,
  pendingVerifications,
}: {
  userCount: number;
  restaurantCount: number;
  orderCount: number;
  revenue: number;
  ridersOnline: { online: number; total: number };
  /** ধাপ ৬ — admin verification queue size. */
  pendingVerifications: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Total Users" value={userCount.toLocaleString()} caption="across all roles" tone="blue" />
      <MetricCard
        label="Restaurants"
        value={restaurantCount.toLocaleString()}
        caption="live on the platform"
        tone="green"
      />
      <MetricCard label="Orders" value={orderCount.toLocaleString()} caption="all-time count" tone="yellow" />
      <MetricCard
        label="Total Revenue"
        value={`৳${revenue.toLocaleString()}`}
        caption="sum of delivered orders"
        tone="red"
      />
      {/* Step 6 — riders online now. Uses `isEffectivelyOnline`
          (see `lib/rider-presence`): an open session whose last
          heartbeat is older than 2 minutes stops counting as
          online. */}
      <MetricCard
        label="Riders Online"
        value={`${ridersOnline.online} of ${ridersOnline.total}`}
        caption="effective in last 2 minutes"
        tone="green"
      />
      <MetricCard
        label="Pending Verifications"
        value={pendingVerifications.toLocaleString()}
        caption="restaurants + riders awaiting review"
        tone="yellow"
      />
    </div>
  );
}

type Tone = "blue" | "green" | "yellow" | "red";
const TONE_CLASSES: Record<Tone, { bg: string; text: string }> = {
  blue: { bg: "bg-[#dbeafe]", text: "text-[#3b82f6]" },
  green: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
  yellow: { bg: "bg-[#fef3c7]", text: "text-[#a16207]" },
  red: { bg: "bg-[#ffebe8]", text: "text-brand" },
};

function MetricCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: Tone;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5"
    >
      <span
        className={
          "inline-flex w-fit items-center rounded-[20px] px-2 py-1 text-[10px] font-bold uppercase tracking-wide " +
          TONE_CLASSES[tone].bg +
          " " +
          TONE_CLASSES[tone].text
        }
      >
        {label}
      </span>
      <span className="font-display text-[28px] font-extrabold text-ink leading-none">
        {value}
      </span>
      <span className="text-[12px] text-ink-muted">{caption}</span>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trend chart                                                                */
/* -------------------------------------------------------------------------- */

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

function OrderTrendChart({
  trend,
}: {
  trend: Array<{ date: string; count: number }>;
}) {
  // Shorten the date keys to "Mon Tue Wed" so the axis doesn't get
  // cramped on the small card width.
  const points = trend.map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString("en-US", {
      weekday: "short",
    }),
  }));

  const isEmpty = points.every((p) => p.count === 0);

  return (
    <section
      aria-label="Order trend"
      className="rounded-2xl border border-line bg-white p-6 lg:col-span-2"
    >
      <header className="flex flex-col gap-1 mb-4">
        <h2 className="font-display text-[16px] font-extrabold text-ink">
          Orders, last 7 days
        </h2>
        <p className="text-[12px] text-ink-muted">
          Daily order count, platform-wide.
        </p>
      </header>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="font-display text-[14px] font-extrabold text-ink">
            No orders in the last 7 days
          </span>
          <p className="max-w-xs text-[12px] text-ink-muted">
            Once customers start placing orders, you&apos;ll see the
            daily trend here.
          </p>
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
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
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={36}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 77, 48, 0.06)" }}
                content={<TrendTooltip />}
              />
              <Bar dataKey="count" fill="#ff4d30" radius={[8, 8, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function TrendTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 shadow-md">
      <span className="block text-[11px] font-semibold text-ink-muted">
        {label}
      </span>
      <span className="block text-[14px] font-extrabold text-brand">
        {Number(value).toLocaleString()} order{Number(value) === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status breakdown                                                           */
/* -------------------------------------------------------------------------- */

const STATUS_ORDER = [
  "PENDING",
  "PREPARING",
  "READY",
  "OFFERED_TO_RIDER",
  "PICKED_UP",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  READY: "Ready",
  OFFERED_TO_RIDER: "Looking for rider",
  PICKED_UP: "Picked up",
  ON_THE_WAY: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-[#ffebe8]", text: "text-brand" },
  PREPARING: { bg: "bg-[#dbeafe]", text: "text-[#3b82f6]" },
  READY: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
  OFFERED_TO_RIDER: { bg: "bg-[#fef3c7]", text: "text-[#a16207]" },
  PICKED_UP: { bg: "bg-[#f9fafb]", text: "text-ink-muted" },
  ON_THE_WAY: { bg: "bg-[#f9fafb]", text: "text-ink-muted" },
  DELIVERED: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
  CANCELLED: { bg: "bg-[#fef2f2]", text: "text-rose-500" },
};

function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  return (
    <section
      aria-label="Orders by status"
      className="rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-col gap-1 mb-4">
        <h2 className="font-display text-[16px] font-extrabold text-ink">
          Orders by status
        </h2>
        <p className="text-[12px] text-ink-muted">
          All-time platform-wide breakdown.
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {STATUS_ORDER.map((key) => {
          const n = counts[key] ?? 0;
          const tone = STATUS_TONE[key] ?? STATUS_TONE.PENDING;
          return (
            <li
              key={key}
              className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2"
            >
              <span
                className={
                  "inline-flex items-center rounded-[20px] px-2.5 py-1 text-[11px] font-semibold " +
                  tone.bg +
                  " " +
                  tone.text
                }
              >
                {STATUS_LABELS[key]}
              </span>
              <span className="font-display text-[14px] font-extrabold text-ink">
                {n.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recent orders                                                              */
/* -------------------------------------------------------------------------- */

function RecentOrdersTable({
  orders,
}: {
  orders: Array<{
    id: string;
    status: string;
    statusLabel: string;
    total: number;
    customerName: string;
    restaurantName: string;
    riderName: string | null;
    placedAt: string;
  }>;
}) {
  return (
    <section
      aria-label="Recent orders"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[16px] font-extrabold text-ink">
          Recent orders
        </h2>
        <p className="text-[12px] text-ink-muted">
          The latest 10 orders across the platform — any status.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="font-display text-[14px] font-extrabold text-ink">
            No orders yet
          </span>
          <p className="max-w-xs text-[12px] text-ink-muted">
            When customers place their first order, it will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="hidden gap-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[110px_1.4fr_1.6fr_120px_140px]">
            <span>Order</span>
            <span>Customer</span>
            <span>Restaurant · Rider</span>
            <span>Total</span>
            <span>Status</span>
          </div>
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li
                key={o.id}
                className="grid w-full grid-cols-1 gap-y-2 rounded-xl border border-line bg-white p-3 md:grid-cols-[110px_1.4fr_1.6fr_120px_140px] md:items-center md:gap-3"
              >
                <span className="font-display text-[13px] font-extrabold text-ink">
                  #KD-{o.id.slice(-6).toUpperCase()}
                </span>
                <span className="text-[13px] font-semibold text-ink truncate">
                  {o.customerName}
                </span>
                <span className="text-[12px] text-ink-muted truncate">
                  {o.restaurantName}
                  {o.riderName ? ` · ${o.riderName}` : " · (no rider yet)"}
                </span>
                <span className="font-display text-[13px] font-extrabold text-brand">
                  ৳{o.total.toLocaleString()}
                </span>
                <StatusBadge status={o.status} label={o.statusLabel} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.PENDING;
  return (
    <span
      data-status={status}
      className={
        "inline-flex w-fit items-center whitespace-nowrap rounded-[20px] px-2.5 py-1 text-[11px] font-semibold " +
        tone.bg +
        " " +
        tone.text
      }
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[112px] animate-pulse rounded-2xl border border-line bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-[300px] animate-pulse rounded-2xl border border-line bg-white lg:col-span-2" />
        <div className="h-[300px] animate-pulse rounded-2xl border border-line bg-white" />
      </div>
      <div className="h-[300px] animate-pulse rounded-2xl border border-line bg-white" />
    </>
  );
}
