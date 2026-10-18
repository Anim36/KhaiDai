// app/api/admin/analytics/route.ts
//
// Feat 3 — Admin Advanced Analytics.
//
//   GET /api/admin/analytics?days=30
//
// ADMIN-only platform-wide analytics. Same per-day bucket
// strategy as the partner route so a single chart shape is
// shared across both dashboards.
//
//   `range`              — { from, to, days }
//   `revenueTrend[]`     — daily DELIVERED revenue + order count
//                          for the last `days` days (default 30).
//   `topRestaurants[]`   — top 10 by DELIVERED order count +
//                          revenue. Cancelled orders excluded.
//   `topRiders[]`         — top 10 by DELIVERED count.
//   `statusFunnel[]`     — counts per status so the page can show
//                          the PENDING → DELIVERED conversion.
//   `peakHours[]`        — { hour, orders } for hours 00..23,
//                          DELIVERED orders in the window.
//   `totals`             — { orders, revenue, customers,
//                          restaurants, riders }.
//   `zoneDistribution[]` — we can't infer zones from lat/lng
//                          without a geocoder, so this is the
//                          null-coords outcome the spec allows:
//                          "order by presence-of-delivery-coords"
//                          style slice. We surface the share of
//                          delivered orders that have a usable
//                          deliveryLat/deliveryLng, the share that
//                          have a non-empty `deliveryAddress`,
//                          and the top 5 by city/sub-string match
//                          on the `deliveryAddress` (cheap, no
//                          external geocoder).
//
// Performance —
//   • `Order.createdAt @@index` covers the windowed scans.
//   • `Order.status @@index` prunes by status before the
//     range scan.
//   • `Order.restaurantId @@index` covers top-restaurants.
//   • `Order.riderId @@index` covers top-riders.
//   The "top restaurants / riders" groupBy fans out to a
//   single IN-list lookup for names — bounded at 10 rows.

import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { dayRangeUtc, formatDayLabel, parseIsoDate, todayUtc } from "@/lib/dates";

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
    status: OrderStatus;
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

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  READY: "Ready",
  PICKED_UP: "Picked Up",
  ON_THE_WAY: "On the Way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  OFFERED_TO_RIDER: "Offered to Rider",
};

function maskName(full: string | null | undefined): string {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return "Rider";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const rest = parts.slice(1).map((p) => `${p[0].toUpperCase()}.`).join(" ");
  return `${first} ${rest}`;
}

function enumerateDaysUtc(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const last = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() <= last.getTime()) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "30");
  if (!Number.isFinite(daysParam) || daysParam < 1 || daysParam > 366) {
    return NextResponse.json(
      { error: "`days` must be an integer between 1 and 366" },
      { status: 400 },
    );
  }
  const days = Math.floor(daysParam);

  const today = todayUtc();
  const to = today;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  // An explicit `from` query param overrides the rolling-window
  // default. We honour it only if it's at most 366 days before
  // `to` — anything bigger would re-introduce the size cap.
  const fromParam = parseIsoDate(url.searchParams.get("from"));
  if (fromParam) {
    if (fromParam.getTime() > today.getTime()) {
      return NextResponse.json(
        { error: "`from` cannot be in the future" },
        { status: 400 },
      );
    }
    const span = (today.getTime() - fromParam.getTime()) / 86400000;
    if (span > 366) {
      return NextResponse.json(
        { error: "`from` cannot be more than 366 days ago" },
        { status: 400 },
      );
    }
  }

  const effectiveFrom = fromParam ?? from;
  const { startUtc, endUtc } = dayRangeUtc(effectiveFrom, to);

  const windowWhere: Prisma.OrderWhereInput = {
    createdAt: { gte: startUtc, lte: endUtc },
  };

  // Fan-out: 4 small aggregates + 3 IN-list lookups for names.
  const [
    deliveredRows,
    statusRows,
    topRestaurantsRaw,
    topRidersRaw,
    allCount,
    cancelledCount,
    revenueSum,
    peakHourRaw,
    withCoordsCount,
    totalOrdersInWindow,
    customerCount,
    restaurantCount,
    riderCount,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { ...windowWhere, status: OrderStatus.DELIVERED },
      select: { total: true, createdAt: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: windowWhere,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["restaurantId"],
      where: { ...windowWhere, status: OrderStatus.DELIVERED },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _count: { restaurantId: "desc" } },
      take: 10,
    }),
    prisma.order.groupBy({
      by: ["riderId"],
      where: {
        ...windowWhere,
        status: OrderStatus.DELIVERED,
        riderId: { not: null },
      },
      _count: { _all: true },
      _sum: { riderEarning: true },
      orderBy: { _count: { riderId: "desc" } },
      take: 10,
    }),
    prisma.order.count({ where: windowWhere }),
    prisma.order.count({
      where: { ...windowWhere, status: OrderStatus.CANCELLED },
    }),
    prisma.order.aggregate({
      where: { ...windowWhere, status: OrderStatus.DELIVERED },
      _sum: { total: true },
    }),
    // Group by hour-of-day using raw SQL — Prisma doesn't expose
    // EXTRACT(HOUR FROM ...) through groupBy. Bound to 23 rows.
    prisma.$queryRaw<Array<{ hour: number; orders: bigint }>>`
      SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour,
             COUNT(*)::bigint AS orders
      FROM "Order"
      WHERE "createdAt" >= ${startUtc}
        AND "createdAt" <= ${endUtc}
        AND status = 'DELIVERED'
      GROUP BY hour
      ORDER BY hour ASC
    `,
    prisma.order.count({
      where: {
        ...windowWhere,
        status: OrderStatus.DELIVERED,
        deliveryLat: { not: null },
        deliveryLng: { not: null },
      },
    }),
    prisma.order.count({ where: windowWhere }),
    prisma.user.count({ where: { role: "CUSTOMER", deletedAt: null } }),
    prisma.restaurant.count({ where: { deletedAt: null } }),
    prisma.user.count({
      where: { role: "RIDER", deletedAt: null, isSuspended: false },
    }),
  ]);

  // -- revenue trend ------------------------------------------------
  const trendBuckets = new Map<string, { revenue: number; orders: number }>();
  for (const d of enumerateDaysUtc(effectiveFrom, to)) {
    trendBuckets.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
  }
  for (const o of deliveredRows) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const b = trendBuckets.get(key);
    if (!b) continue;
    b.revenue += o.total;
    b.orders += 1;
  }
  const revenueTrend = [...trendBuckets.entries()].map(([iso, v]) => ({
    date: iso,
    label: formatDayLabel(iso),
    revenue: v.revenue,
    orders: v.orders,
  }));

  // -- top restaurants (lookup names) ------------------------------
  const topRIds = topRestaurantsRaw.map((r) => r.restaurantId);
  const restNames = topRIds.length
    ? await prisma.restaurant.findMany({
        where: { id: { in: topRIds } },
        select: { id: true, name: true },
      })
    : [];
  const restNameById = new Map(restNames.map((r) => [r.id, r.name]));
  const topRestaurants = topRestaurantsRaw.map((r) => ({
    restaurantId: r.restaurantId,
    name: restNameById.get(r.restaurantId) ?? "(deleted restaurant)",
    deliveredCount: r._count._all,
    revenue: r._sum.total ?? 0,
  }));

  // -- top riders (mask + lookup names) ----------------------------
  const topRRaw = topRidersRaw.filter(
    (r): r is typeof r & { riderId: string } => typeof r.riderId === "string",
  );
  const rIds = topRRaw.map((r) => r.riderId);
  const riderNames = rIds.length
    ? await prisma.user.findMany({
        where: { id: { in: rIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameByRiderId = new Map(riderNames.map((u) => [u.id, u.name]));
  const topRiders = topRRaw.map((r) => ({
    riderId: r.riderId,
    maskedName: maskName(nameByRiderId.get(r.riderId)),
    deliveries: r._count._all,
    earnings: r._sum.riderEarning ?? 0,
  }));

  // -- status funnel ------------------------------------------------
  const totalAcrossStatuses = statusRows.reduce(
    (s, r) => s + r._count._all,
    0,
  );
  const statusFunnel = (Object.keys(STATUS_LABEL) as OrderStatus[])
    .map((status) => {
      const row = statusRows.find((r) => r.status === status);
      const count = row?._count._all ?? 0;
      return {
        status,
        label: STATUS_LABEL[status],
        count,
        percentage:
          totalAcrossStatuses > 0
            ? Math.round((count * 1000) / totalAcrossStatuses) / 10
            : 0,
      };
    })
    .filter((r) => r.count > 0);

  // -- peak hours (24 buckets) -------------------------------------
  const hourMap = new Map<number, number>();
  for (const row of peakHourRaw) {
    hourMap.set(Number(row.hour), Number(row.orders));
  }
  const peakHours = Array.from({ length: 24 }).map((_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    orders: hourMap.get(hour) ?? 0,
  }));

  // -- zone distribution -------------------------------------------
  // We don't have a geocoder; instead we cluster by the first
  // comma-separated token in `deliveryAddress` (e.g. "Banani,
  // Dhaka"). Falls back to a generic bucket for empty strings.
  const addresses = await prisma.order.findMany({
    where: { ...windowWhere, status: OrderStatus.DELIVERED },
    select: { deliveryAddress: true, deliveryLat: true },
    take: 5000, // sample ceiling
  });
  const keywordCounts = new Map<string, number>();
  for (const o of addresses) {
    const addr = (o.deliveryAddress ?? "").trim();
    const first = addr.split(",")[0]?.trim() || "Unknown";
    const key = first.length === 0 ? "Unknown" : first;
    keywordCounts.set(key, (keywordCounts.get(key) ?? 0) + 1);
  }
  const byAddressKeyword = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keyword, count]) => ({ keyword, count }));
  const zoneDistribution = {
    withCoords: withCoordsCount,
    withoutCoords: Math.max(0, totalOrdersInWindow - withCoordsCount),
    byAddressKeyword,
  };

  // -- totals -------------------------------------------------------
  const totals = {
    orders: allCount,
    delivered: deliveredRows.length,
    cancelled: cancelledCount,
    revenue: revenueSum._sum.total ?? 0,
    customers: customerCount,
    restaurants: restaurantCount,
    riders: riderCount,
  };

  const body: AdminAnalyticsResponse = {
    range: {
      from: effectiveFrom.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      days: Math.ceil(
        (to.getTime() - effectiveFrom.getTime()) / 86400000,
      ) + 1,
    },
    totals,
    revenueTrend,
    topRestaurants,
    topRiders,
    statusFunnel,
    peakHours,
    zoneDistribution,
  };

  return NextResponse.json(body);
}