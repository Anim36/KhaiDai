import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  orderStatusForApi,
  orderStatusLabel,
  type OrderStatusApi,
} from "@/lib/orders";
import { closeStaleRiderOnlineSessions } from "@/lib/rider-hours";
import { PRESENCE_STALE_MS } from "@/lib/rider-presence";

/**
 * GET /api/admin/overview
 *
 * ADMIN-only platform summary for the dashboard tiles + 7-day
 * order-count trend chart. Aggregates are intentionally computed
 * server-side in a handful of cheap count / groupBy queries so the
 * client can render the page in a single fetch.
 *
 * Response shape:
 *   {
 *     userCounts:   { customer, partner, rider, admin, total },
 *     restaurantCount: number,
 *     orderCounts:    { pending, preparing, ready, ..., delivered, cancelled, total },
 *     totalRevenue:   number,                       // sum of DELIVERED orders
 *     recentOrders:   AdminOrderRow[],              // last 10, any status
 *     orderTrend:     [{ date: "YYYY-MM-DD", count }, ...]  // last 7 days
 *   }
 *
 *   200 { ... }
 *   401 missing / invalid token
 *   403 wrong role
 *   500 server error
 */

const ORDER_STATUS_VALUES = [
  "PENDING",
  "PREPARING",
  "READY",
  "OFFERED_TO_RIDER",
  "PICKED_UP",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
] as const;
type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

type AdminOrderRow = {
  id: string;
  status: string;
  statusLabel: string;
  total: number;
  customerName: string;
  restaurantName: string;
  riderName: string | null;
  placedAt: string;
};

type TrendPoint = { date: string; count: number };

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    /* ---------------------------------------------------------------- */
    /*  User counts by role                                              */
    /* ---------------------------------------------------------------- */
    const userRows = await prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const userCounts = {
      customer: 0,
      partner: 0,
      rider: 0,
      admin: 0,
      total: 0,
    };
    for (const row of userRows) {
      const n = row._count._all;
      userCounts.total += n;
      if (row.role === "CUSTOMER") userCounts.customer = n;
      else if (row.role === "PARTNER") userCounts.partner = n;
      else if (row.role === "RIDER") userCounts.rider = n;
      else if (row.role === "ADMIN") userCounts.admin = n;
    }

    /* ---------------------------------------------------------------- */
    /*  Restaurant count (live rows, not soft-deleted or suspended)      */
    /* ---------------------------------------------------------------- */
    const restaurantCount = await prisma.restaurant.count({
      where: { deletedAt: null, isSuspended: false },
    });

    /* ---------------------------------------------------------------- */
    /*  Order counts by status + total revenue from DELIVERED            */
    /* ---------------------------------------------------------------- */
    const orderRows = await prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const orderCounts: Record<OrderStatus | "total", number> = {
      PENDING: 0,
      PREPARING: 0,
      READY: 0,
      OFFERED_TO_RIDER: 0,
      PICKED_UP: 0,
      ON_THE_WAY: 0,
      DELIVERED: 0,
      CANCELLED: 0,
      total: 0,
    };
    for (const row of orderRows) {
      const n = row._count._all;
      orderCounts[row.status as OrderStatus] = n;
      orderCounts.total += n;
    }

    const deliveredAgg = await prisma.order.aggregate({
      where: { status: "DELIVERED" },
      _sum: { total: true },
    });
    const totalRevenue = deliveredAgg._sum.total ?? 0;

    /* ---------------------------------------------------------------- */
    /*  Recent 10 orders — any status, newest first                      */
    /* ---------------------------------------------------------------- */
    const recentRows = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true } },
        restaurant: { select: { name: true } },
        rider: { select: { name: true } },
      },
    });
    const recentOrders: AdminOrderRow[] = recentRows.map((o) => {
      const api = orderStatusForApi(o.status) as OrderStatusApi;
      return {
        id: o.id,
        status: api,
        statusLabel: orderStatusLabel[api],
        total: o.total,
        customerName: o.customer?.name ?? "Customer",
        restaurantName: o.restaurant?.name ?? "Restaurant",
        riderName: o.rider?.name ?? null,
        placedAt: o.createdAt.toISOString(),
      };
    });

    /* ---------------------------------------------------------------- */
    /*  Riders online right now (X of Y) — uses presence + freshness.    */
    /* ---------------------------------------------------------------- */
    await closeStaleRiderOnlineSessions();
    const cutoff = new Date(Date.now() - PRESENCE_STALE_MS);
    const [onlineRiders, totalRiders, pendingRestaurants, pendingRiders] =
      await Promise.all([
        prisma.riderProfile.count({
          where: { isOnline: true, lastLocationUpdate: { gte: cutoff } },
        }),
        prisma.riderProfile.count(),
        // ধাপ ৬ — combined pending verification count for the
        // dashboard tile.
        prisma.restaurant.count({
          where: {
            verificationStatus: "PENDING",
            deletedAt: null,
          },
        }),
        prisma.riderProfile.count({
          where: { verificationStatus: "PENDING" },
        }),
      ]);
    const pendingVerifications = pendingRestaurants + pendingRiders;

    /* ---------------------------------------------------------------- */
    /*  7-day order-count trend (oldest → newest)                        */
    /* ---------------------------------------------------------------- */
    const trend = await last7DayOrderTrend();

    return NextResponse.json(
      {
        userCounts,
        restaurantCount,
        orderCounts,
        totalRevenue,
        recentOrders,
        orderTrend: trend,
        ridersOnline: { online: onlineRiders, total: totalRiders },
        // ধাপ ৬ — combined PENDING count for restaurants + riders
        // surfaced on the dashboard.
        pendingVerifications,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to build admin overview",
      },
      { status: 500 },
    );
  }
}

/**
 * Bucket order counts into the last 7 calendar days (UTC).
 *
 * Implementation note: rather than running 7 separate `count`s we
 * pull every `createdAt` for the last 7 days and tally in JS —
 * for a small-medium dataset this is cheaper and gives us a
 * guaranteed 7-element array with zeros for empty days.
 */
async function last7DayOrderTrend(): Promise<TrendPoint[]> {
  const now = new Date();
  // Start of "today" (UTC midnight). The trend window is `[start, now]`.
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 6, // 7 days inclusive of today
    ),
  );

  const rows = await prisma.order.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    buckets.set(toDateKey(d), 0);
  }
  for (const r of rows) {
    const key = toDateKey(r.createdAt);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({
    date,
    count,
  }));
}

function toDateKey(d: Date): string {
  // Stable YYYY-MM-DD in UTC. The chart's day labels match the API.
  return d.toISOString().slice(0, 10);
}
