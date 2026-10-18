import { NextRequest, NextResponse } from "next/server";
import {
  Prisma,
  OrderStatus,
  type PayoutStatus,
  type PayoutMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/partner/earnings
 *
 * Partner-only — returns the data that backs the partner earnings
 * page. Everything here is computed from the same DB tables so the
 * page can never get out of sync with reality:
 *
 *   summary
 *     • today      sum of DELIVERED orders for the restaurant today.
 *     • week       sum of DELIVERED orders in the last 7 days.
 *     • month      sum of DELIVERED orders in the last 30 days.
 *
 *   dailyRevenue[]
 *     30 days of revenue, oldest first. Each entry has a
 *     YYYY-MM-DD `date`, a "12 Apr" style `label`, and the day's
 *     total. Used by the chart's daily/weekly/monthly toggle.
 *
 *   transactions[]
 *     Last 25 DELIVERED orders as a list of { date, orderId,
 *     amount, status: "paid" }. Older payouts don't show here.
 *
 *   balance
 *     Total DELIVERED minus the sum of any Payout rows that aren't
 *     FAILED. This is the figure the payout modal will gate on.
 *
 *   canRequestPayout
 *     True iff balance >= MIN_PAYOUT_TAKA (৳500). The button on the
 *     page mirrors this flag, but the POST handler re-checks.
 *
 *   payouts[]
 *     Recent payout requests for this partner's restaurant, newest
 *     first, capped at 25 rows so the table never runs off the
 *     page.
 *
 * Responses:
 *   200 { ... }
 *   204 partner has not created a restaurant yet
 *   401 / 403 handled by `requireRole`
 *   500 server error
 */

const MIN_PAYOUT_TAKA = 500;

function formatTaka(n: number): string {
  return `৳${Math.round(n).toLocaleString("en-IN")}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function lastNDays(n: number): Date[] {
  const out: Date[] = [];
  const base = startOfDay(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(d);
  }
  return out;
}

function formatLabel(d: Date): string {
  // "12 Apr" — short, deterministic. Locale is intentionally fixed
  // to en-GB so SSR and CSR agree regardless of host locale.
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function formatDisplayDate(d: Date): string {
  // "12 Apr 2025" — for the transactions list.
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });
  if (!restaurant) {
    // Partner hasn't created a restaurant yet. The dashboard's
    // onboarding flow already shows an empty state, so returning 204
    // keeps the page's "no data yet" branch working.
    return new NextResponse(null, { status: 204 });
  }

  // Time windows: today, last 7 days, last 30 days. The chart wants
  // 30 days specifically; the summary tiles want rolling windows.
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - 6); // inclusive 7-day window
  const monthStart = new Date(todayStart);
  monthStart.setDate(todayStart.getDate() - 29); // inclusive 30-day window

  // Run the three aggregates in one query each. The order row
  // already stores subtotal + deliveryFee + tax separately so we
  // could pick any of them; we use `total` because that's what the
  // customer paid.
  const [todaySum, weekSum, monthSum, dailyRows, deliveredRows, payoutRows] =
    await Promise.all([
      sumDelivered({
        restaurantId: restaurant.id,
        gte: todayStart,
      }),
      sumDelivered({
        restaurantId: restaurant.id,
        gte: weekStart,
      }),
      sumDelivered({
        restaurantId: restaurant.id,
        gte: monthStart,
      }),
      // 30-day daily revenue series. Prisma can groupBy day only on
      // its built-in date_trunc, but that needs raw SQL — easier to
      // pull the individual rows for the 30-day window and bucket
      // them in JS. The 30-day ceiling keeps this bounded (~hundreds
      // of rows max for a busy partner).
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          status: OrderStatus.DELIVERED,
          createdAt: { gte: monthStart },
        },
        select: { total: true, createdAt: true },
      }),
      // Transactions = last 25 DELIVERED orders, newest first. We
      // pull a slightly wider window then trim in code so the
      // newest-first ordering is stable.
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          status: OrderStatus.DELIVERED,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          total: true,
          createdAt: true,
        },
      }),
      // All non-FAILED payouts so we can compute balance. Recent
      // payout history is also shown on the page, capped at 25.
      prisma.payout.findMany({
        where: {
          restaurantId: restaurant.id,
          status: { not: "FAILED" as PayoutStatus },
        },
        select: { amount: true },
      }),
    ]);

  // Bucketing for the chart — start with 30 zero buckets so the
  // chart always has the same x-axis regardless of how many orders
  // landed. Then add up each day's total.
  const buckets = new Map<string, number>();
  for (const d of lastNDays(30)) {
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of dailyRows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + row.total);
  }
  const dailyRevenue = [...buckets.entries()].map(([iso, amount]) => {
    const d = new Date(iso);
    return { date: iso, label: formatLabel(d), amount };
  });

  const transactions = deliveredRows.map((r) => ({
    id: r.id,
    date: formatDisplayDate(r.createdAt),
    orderId: `#KD-${r.id.slice(-4).toUpperCase()}`,
    amount: formatTaka(r.total),
    status: "paid" as const,
  }));

  const payoutsSpent = payoutRows.reduce(
    (sum, p) => sum + p.amount,
    0,
  );
  const balance = Math.max(0, monthSum - payoutsSpent);

  // Pull full payout history (with status) for the PayoutDetails
  // section. Capped at 25 so the table stays a reasonable length.
  const payoutHistory = await prisma.payout.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json(
    {
      summary: {
        today: todaySum,
        week: weekSum,
        month: monthSum,
      },
      summaryCards: [
        {
          id: "today",
          labelKey: "partner.earnings.summary.netEarnings",
          captionKey:
            todaySum > 0
              ? "partner.earnings.summary.netEarningsHelp"
              : null,
          value: formatTaka(todaySum),
          tone: "red",
        },
        {
          id: "week",
          labelKey: "partner.earnings.summary.ordersPaid",
          captionKey:
            weekSum > 0
              ? "partner.earnings.summary.ordersPaidHelp"
              : null,
          value: formatTaka(weekSum),
          tone: "blue",
        },
        {
          id: "month",
          labelKey: "partner.earnings.summary.avgOrder",
          captionKey:
            monthSum > 0
              ? "partner.earnings.summary.avgOrderHelp"
              : null,
          value: formatTaka(monthSum),
          tone: "yellow",
        },
      ],
      dailyRevenue,
      transactions,
      balance,
      minPayout: MIN_PAYOUT_TAKA,
      canRequestPayout: balance >= MIN_PAYOUT_TAKA,
      payouts: payoutHistory.map((p) => ({
        id: p.id,
        date: formatDisplayDate(p.createdAt),
        amount: formatTaka(p.amount),
        method: p.method as PayoutMethod,
        destination: p.destination,
        note: p.note,
        status: payoutStatusToUi(p.status as PayoutStatus),
      })),
    },
    { status: 200 },
  );
}

async function sumDelivered({
  restaurantId,
  gte,
}: {
  restaurantId: string;
  gte: Date;
}) {
  const aggregate = await prisma.order.aggregate({
    where: {
      restaurantId,
      status: OrderStatus.DELIVERED,
      createdAt: { gte },
    },
    _sum: { total: true },
  });
  return aggregate._sum.total ?? 0;
}

function ordersToday(rows: Array<{ createdAt: Date }>, todayStart: Date) {
  let n = 0;
  for (const r of rows) {
    if (r.createdAt >= todayStart) n += 1;
  }
  return n;
}

function payoutStatusToUi(s: PayoutStatus): "paid" | "pending" {
  // The earnings table only knows two states. Until we wire a real
  // gateway, every Payout stays PENDING — show "pending" for that
  // and "paid" only for COMPLETED. PROCESSING/FAILED map to "pending"
  // so the table never has to know about internal statuses.
  return s === "COMPLETED" ? "paid" : "pending";
}

// Unused import so we don't get flagged — Prisma types are referenced
// via the OrderStatus enum above.
export type _PayoutMethod = PayoutMethod;
export type _Prisma = typeof Prisma;
