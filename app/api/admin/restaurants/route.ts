import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/restaurants
 *
 * ADMIN-only platform-wide restaurant list for /admin/restaurants.
 * Soft-deleted rows are hidden by default; pass `?includeDeleted=1`
 * to surface them (used by the detail modal for admins investigating
 * old orders).
 *
 * Query params:
 *   • `q`              search by restaurant name (case-insensitive)
 *   • `suspended`      "true" | "false" — restrict to one bucket
 *   • `page`           1-based, default 1
 *   • `pageSize`       default 25, capped at 100
 *   • `includeDeleted` "1" to include soft-deleted rows
 *
 * Response:
 *   {
 *     restaurants: AdminRestaurantRow[],
 *     total:       number,
 *     page:        number,
 *     pageSize:    number,
 *   }
 */

type AdminRestaurantRow = {
  id: string;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  ownerName: string;
  ownerEmail: string;
  isSuspended: boolean;
  /**
   * Bug 3 — partner-side "Accepting Orders" toggle. Surfaced in
   * the admin table so the admin can tell at a glance whether the
   * restaurant is currently taking orders, distinct from the
   * platform-level `isSuspended` gate.
   */
  isAcceptingOrders: boolean;
  deletedAt: string | null;
  totalOrders: number;
  createdAt: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const qParam = url.searchParams.get("q")?.trim() ?? "";
  const suspendedParam = url.searchParams.get("suspended");
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "25");
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Math.min(
    100,
    Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 25),
  );

  const where: Record<string, unknown> = {};
  if (!includeDeleted) where.deletedAt = null;
  if (suspendedParam === "true") where.isSuspended = true;
  else if (suspendedParam === "false") where.isSuspended = false;
  if (qParam.length > 0) {
    where.name = { contains: qParam, mode: "insensitive" };
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          cuisine: true,
          address: true,
          rating: true,
          isSuspended: true,
          // Bug 3 — partner "Accepting Orders" toggle. Carried
          // through to the admin row so the table can show
          // "Online" / "Offline" alongside the platform-level
          // Suspended / Active flag.
          isAcceptingOrders: true,
          deletedAt: true,
          createdAt: true,
          owner: { select: { name: true, email: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.restaurant.count({ where }),
    ]);

    const restaurants: AdminRestaurantRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      address: r.address,
      rating: r.rating,
      ownerName: r.owner?.name ?? "—",
      ownerEmail: r.owner?.email ?? "—",
      isSuspended: r.isSuspended,
      isAcceptingOrders: r.isAcceptingOrders,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      totalOrders: r._count.orders,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(
      { restaurants, total, page, pageSize },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list restaurants",
      },
      { status: 500 },
    );
  }
}
