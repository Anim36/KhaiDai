"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { RiderEarningsHeader } from "@/components/rider/earnings/RiderEarningsHeader";
import { EarningsSummaryCard } from "@/components/rider/earnings/EarningsSummaryCard";
import { EarningsChart } from "@/components/rider/earnings/EarningsChart";
import { TripHistoryList } from "@/components/rider/earnings/TripHistoryList";
import { WithdrawBar } from "@/components/rider/earnings/WithdrawBar";
import { CashOutHistory } from "@/components/rider/earnings/TripHistoryList";
import { useOrdersFeed, refreshOrdersFeed } from "@/lib/useOrdersFeed";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import {
  cashOutHistory,
  riderShare,
  type ChartPoint,
  type EarningsSummary,
  type TripHistoryRow,
} from "@/data/rider-earnings";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Wire shape + projection                                                    */
/* -------------------------------------------------------------------------- */

type WireOrder = {
  id?: string;
  status?: string;
  total?: number;
  /** Server-side snapshot of the rider's share of the delivery fee.
   *  Older rows may be `null` — the helper falls back to the
   *  legacy 8% formula so the dashboard never blanks out. */
  riderEarning?: number | null;
  placedAt?: string;
  restaurant?: { id?: string; name?: string; address?: string };
  customer?: { id?: string; name?: string; phone?: string | null };
};

function safeStr(s: unknown, fallback = ""): string {
  return typeof s === "string" && s.length > 0 ? s : fallback;
}
function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function shortDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function fullDayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatRowWhen(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function shortRowWhen(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function buildChart(
  delivered: WireOrder[],
  now: Date = new Date(),
): ChartPoint[] {
  // Bucket delivered orders by day for the last 14 days (incl. today).
  const points: ChartPoint[] = [];
  const keyToIdx = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const offset = 13 - i;
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    points.push({
      label: shortDayLabel(d),
      fullDate: fullDayLabel(d),
      earnings: 0,
      deliveries: 0,
    });
    keyToIdx.set(dayKey(d), i);
  }
  for (const o of delivered) {
    if (!o.placedAt) continue;
    const d = new Date(o.placedAt);
    if (Number.isNaN(d.getTime())) continue;
    const idx = keyToIdx.get(dayKey(d));
    if (idx === undefined) continue;
    points[idx].earnings += riderShare(safeNum(o.total), o.riderEarning);
    points[idx].deliveries += 1;
  }
  return points;
}

/**
 * Build the top-of-page hero summary.
 *
 *   • today's earnings — sum of rider share from today's delivered orders
 *   • yesterday — same metric, but for the prior calendar day, so the
 *     "+12% vs yesterday" delta pill shows something useful
 *   • deliveries / hours / perTrip / incentive — derived from today's
 *     orders. "Incentive" is a placeholder until the backend exposes
 *     the per-trip incentive column.
 */
function buildSummary(
  delivered: WireOrder[],
  now: Date = new Date(),
): EarningsSummary {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const endYesterday = new Date(startToday);
  endYesterday.setMilliseconds(-1);

  let todayRaw = 0;
  let yesterdayRaw = 0;
  let todayCount = 0;
  for (const o of delivered) {
    if (!o.placedAt) continue;
    const d = new Date(o.placedAt);
    if (Number.isNaN(d.getTime())) continue;
    const share = riderShare(safeNum(o.total), o.riderEarning);
    if (d >= startToday) {
      todayRaw += share;
      todayCount += 1;
    } else if (d >= startYesterday && d <= endYesterday) {
      yesterdayRaw += share;
    }
  }

  return {
    today: formatTaka(todayRaw),
    todayRaw,
    deliveries: todayCount,
    hoursOnline: "—",
    perTrip: todayCount > 0 ? formatTaka(Math.round(todayRaw / todayCount)) : "৳0",
    incentive: "৳0",
    yesterdayRaw,
  };
}

function buildTripRows(
  delivered: WireOrder[],
  now: Date = new Date(),
): TripHistoryRow[] {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 2); // last 3 days incl. today
  const rows: TripHistoryRow[] = [];
  for (const o of delivered) {
    if (!o.placedAt) continue;
    const d = new Date(o.placedAt);
    if (Number.isNaN(d.getTime())) continue;
    if (d < cutoff) continue;
    const total = safeNum(o.total);
    rows.push({
      id: safeStr(o.id),
      when: formatRowWhen(d),
      shortWhen: shortRowWhen(d),
      restaurant: safeStr(o.restaurant?.name, "Restaurant"),
      customer: safeStr(o.customer?.name, "Customer"),
      distance: "—",
      duration: "—",
      earned: formatTaka(riderShare(total, o.riderEarning)),
      payment: total === 0 ? "Cash" : "bKash",
    });
  }
  return rows.sort((a, b) => (a.when < b.when ? 1 : -1));
}

/* -------------------------------------------------------------------------- */
/*  Page shell                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * /rider/earnings orchestrator.
 *
 *   • Page bg `#f9fafb`.
 *   • Two-column shell: 260px sidebar (`activeKey="earnings"`) +
 *     flex-1 main column.
 *   • Main column = header strip + 32px-padded body containing:
 *       1. EarningsSummaryCard — top hero (today's big number).
 *       2. EarningsChart        — Recharts 14-day LineChart.
 *       3. TripHistoryList      — completed-delivery rows.
 *       4. CashOutHistory       — past withdrawal log (empty until
 *                                  a payouts API lands).
 *       5. WithdrawBar          — sticky bottom confirm bar.
 *
 * Data flow:
 *   • Single `/api/orders` fetch on mount. The summary + chart +
 *     trip rows are all derived from the same fetched list.
 *   • Withdraw / cash-out flows are intentionally mocked locally
 *     (700 ms success toast). A real payout endpoint is out of
 *     scope for this fix.
 */
export function RiderEarningsPage() {
  const t = useT();
  const withdrawRef = useRef<HTMLDivElement | null>(null);
  const [delivered, setDelivered] = useState<WireOrder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Pull from the shared feed so the partner dashboard, history
  // page and earnings page all read the same in-memory snapshot —
  // no duplicate /api/orders fetches across surfaces.
  const feed = useOrdersFeed("RIDER");
  useEffect(() => {
    if (feed.error) setLoadError(feed.error);
    setDelivered(feed.orders.filter((o) => o?.status === "delivered"));
    setLoaded(true);
  }, [feed.orders, feed.error]);

  const summary = useMemo(() => buildSummary(delivered), [delivered]);
  const chart = useMemo(() => buildChart(delivered), [delivered]);
  const tripRows = useMemo(() => buildTripRows(delivered), [delivered]);

  const scrollToWithdraw = () => {
    withdrawRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <RequireAuth role="RIDER">
      <RiderShell activeKey="earnings">
        <RiderEarningsHeader
          availableBalance={summary.today}
          onWithdrawClick={scrollToWithdraw}
        />

        <div className="flex flex-1 flex-col gap-6 p-8">
          {loadError ? (
            <div
              role="alert"
              className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700"
            >
              {t("rider.earnings.loadFailed", { msg: loadError })}{" "}
              {t("rider.earnings.feedLoadFailedSuffix")}
            </div>
          ) : null}
          <EarningsSummaryCard summary={summary} />
          <EarningsChart data={chart} />
          <TripHistoryList trips={tripRows} />
          <CashOutHistory rows={cashOutHistory} />
        </div>

        <div ref={withdrawRef}>
          <WithdrawBar availableBalance={summary.today} />
        </div>
      </RiderShell>
    </RequireAuth>
    );
}
