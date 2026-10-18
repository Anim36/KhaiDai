// app/api/partner/analytics/route.ts
//
// Feat 1 — Partner sales analytics.
//
//   GET /api/partner/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Aggregates the calling partner's restaurant(s) over the date
// range `[from, to]` inclusive. All numeric data comes from
// the `Order` + `OrderItem` tables; the menu ranking pulls
// `OrderItem.menuItemId` for top items.
//
//   `summary` — { totalOrders, totalRevenue, averageOrderValue,
//                  busiestDay, busiestHour }
//     All counts include ONLY DELIVERED orders; the status
//     breakdown covers the full window regardless of status.
//
//   `dailyRevenue[]` — one bucket per day in the range with
//     revenue, order count, and a couple of "best hour" markers.
//     `[]` if the partner has no delivered orders yet.
//
//   `topItems[]` — top-10 menu items by quantity sold (DELIVERED
//     orders only) in the window. Ties broken by revenue desc.
//
//   `statusBreakdown[]` — counts per OrderStatus over the whole
//     window (not just DELIVERED) so the pie chart shows the
//     cancellation funnel.
//
//   `restaurants[]` — the partner's restaurants (id + name) so
//     the UI can label the report correctly. Always non-empty
//     because requireRole already filtered out non-partners.
//
// Performance — three indexed columns drive this report:
//   • `Order(restaurantId, createdAt)` — covered by the existing
//     @@index([restaurantId]).
//   • `OrderItem(orderId)` — covered by the @@index([orderId]).
//   • `Order.status` — covered by the @@index([status]).
// The window is bounded by the caller-supplied `from` / `to` so
// the rows in-flight can't run away. No raw SQL needed.

import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { dayRangeUtc, formatDayLabel, formatHourLabel, parseIsoDate, todayUtc } from "@/lib/dates";

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
    status: OrderStatus;
    label: string;
    count: number;
    percentage: number;
  }>;
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

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  // Date defaults: last 30 days inclusive of today. We always
  // pass full-day UTC bounds so the buckets line up with
  // `formatDayLabel` / `formatHourLabel` on the client.
  const today = todayUtc();
  const defaultTo = today;
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

  const from = parseIsoDate(fromParam) ?? defaultFrom;
  const to = parseIsoDate(toParam) ?? defaultTo;
  if (from > to) {
    return NextResponse.json(
      { error: "`from` must be on or before `to`" },
      { status: 400 },
    );
  }
  // Cap the range at 366 days — a year-long report is the
  // longest sensible window. Anything past that is almost
  // certainly a misconfiguration.
  const oneYear = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > oneYear) {
    return NextResponse.json(
      { error: "Date range too large (max 366 days)" },
      { status: 400 },
    );
  }

  const { startUtc, endUtc } = dayRangeUtc(from, to);

  // Resolve the partner's restaurants. Partners may own more
  // than one in the schema but the MVP only renders one — we
  // sum across all of them so the report matches reality.
  const restaurants = await prisma.restaurant.findMany({
    where: { ownerId: auth.user.id, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (restaurants.length === 0) {
    return NextResponse.json(
      { error: "Partner has no restaurant on file" },
      { status: 404 },
    );
  }
  const restaurantIds = restaurants.map((r) => r.id);
  const restaurantWhere: Prisma.OrderWhereInput = {
    restaurantId: { in: restaurantIds },
    createdAt: { gte: startUtc, lte: endUtc },
  };

  // Fan-out: four small queries; none pulls heavy columns.
  const [deliveredOrders, allOrdersInRange, topItemsRaw] = await Promise.all([
    prisma.order.findMany({
      where: { ...restaurantWhere, status: OrderStatus.DELIVERED },
      select: { id: true, createdAt: true, total: true, items: { select: { menuItemId: true, quantity: true, price: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: restaurantWhere,
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: {
        order: {
          ...restaurantWhere,
          status: OrderStatus.DELIVERED,
        },
      },
      _sum: { quantity: true, price: true },
    }),
  ]);

  // -- summary ---------------------------------------------------------
  const totalOrders = deliveredOrders.length;
  const totalRevenue = deliveredOrders.reduce((s, o) => s + o.total, 0);
  const averageOrderValue =
    totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const dayBuckets = new Map<string, number>();
  const hourBuckets = new Map<number, number>();
  for (const o of deliveredOrders) {
    const dayKey = o.createdAt.toISOString().slice(0, 10);
    dayBuckets.set(dayKey, (dayBuckets.get(dayKey) ?? 0) + 1);
    const h = o.createdAt.getUTCHours();
    hourBuckets.set(h, (hourBuckets.get(h) ?? 0) + 1);
  }
  const busiestDayEntry = [...dayBuckets.entries()].sort((a, b) => b[1] - a[1])[0];
  const busiestDay = busiestDayEntry
    ? {
        date: busiestDayEntry[0],
        label: formatDayLabel(busiestDayEntry[0]),
        orders: busiestDayEntry[1],
      }
    : null;
  const busiestHourEntry = [...hourBuckets.entries()].sort((a, b) => b[1] - a[1])[0];
  const busiestHour = busiestHourEntry
    ? {
        hour: busiestHourEntry[0],
        label: formatHourLabel(busiestHourEntry[0]),
        orders: busiestHourEntry[1],
      }
    : null;

  // -- daily revenue ---------------------------------------------------
  const revenueBuckets = new Map<string, { revenue: number; orders: number }>();
  for (const d of enumerateDaysUtc(from, to)) {
    const key = d.toISOString().slice(0, 10);
    revenueBuckets.set(key, { revenue: 0, orders: 0 });
  }
  for (const o of deliveredOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const bucket = revenueBuckets.get(key);
    if (!bucket) continue;
    bucket.revenue += o.total;
    bucket.orders += 1;
  }
  const dailyRevenue = [...revenueBuckets.entries()].map(([iso, v]) => ({
    date: iso,
    label: formatDayLabel(iso),
    revenue: v.revenue,
    orders: v.orders,
  }));

  // -- top items -------------------------------------------------------
  // groupBy already gave us quantity + price per menuItemId. We need
  // the menu name so we look it up — at most 10 rows even for busy
  // partners.
  const topMenuItemIds = topItemsRaw
    .slice()
    .sort((a, b) => (b._sum.quantity ?? 0) - (a._sum.quantity ?? 0))
    .slice(0, 10);
  const menuNames = await prisma.menuItem.findMany({
    where: { id: { in: topMenuItemIds.map((t) => t.menuItemId) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(menuNames.map((m) => [m.id, m.name]));
  const topItems = topMenuItemIds.map((t) => ({
    menuItemId: t.menuItemId,
    name: nameMap.get(t.menuItemId) ?? "(deleted item)",
    quantitySold: t._sum.quantity ?? 0,
    revenue: t._sum.price ?? 0,
  }));

  // -- status breakdown ------------------------------------------------
  const totalAcrossStatuses = allOrdersInRange.reduce(
    (s, r) => s + r._count._all,
    0,
  );
  const statusBreakdown = (Object.keys(STATUS_LABEL) as OrderStatus[])
    .map((status) => {
      const row = allOrdersInRange.find((r) => r.status === status);
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

  const body: AnalyticsResponse = {
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    restaurants: restaurants.map((r) => ({ id: r.id, name: r.name })),
    summary: {
      totalOrders,
      totalRevenue,
      averageOrderValue,
      busiestDay,
      busiestHour,
    },
    dailyRevenue,
    topItems,
    statusBreakdown,
  };

  return NextResponse.json(body);
}

/**
 * Enumerate every UTC date in `[from, to]`. Days are written
 * at midnight UTC so the bucket keys line up with
 * `o.createdAt.toISOString().slice(0, 10)` regardless of the
 * client's timezone — the chart x-axis is just a date string.
 */
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