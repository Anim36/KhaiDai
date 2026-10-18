import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { auditRestaurantSuspend } from "@/lib/audit";

/**
 * GET  /api/admin/restaurants/[id] — restaurant detail incl. counters.
 * PATCH /api/admin/restaurants/[id] — toggle `isSuspended`.
 *
 * ADMIN-only. PATCH refuses to touch soft-deleted rows — those
 * belong to the partner deletion flow, not admin moderation.
 */

type AdminRestaurantDetail = {
  id: string;
  name: string;
  cuisine: string;
  address: string;
  openingHours: string;
  deliveryTime: number;
  deliveryFee: number;
  rating: number;
  isSuspended: boolean;
  deletedAt: string | null;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  totalOrders: number;
  totalMenuItems: number;
  totalPromoCodes: number;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const row = await prisma.restaurant.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        _count: {
          select: { orders: true, menu: true, promoCodes: true },
        },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 },
      );
    }

    const detail: AdminRestaurantDetail = {
      id: row.id,
      name: row.name,
      cuisine: row.cuisine,
      address: row.address,
      openingHours: row.openingHours,
      deliveryTime: row.deliveryTime,
      deliveryFee: row.deliveryFee,
      rating: row.rating,
      isSuspended: row.isSuspended,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      ownerName: row.owner?.name ?? "—",
      ownerEmail: row.owner?.email ?? "—",
      ownerPhone: row.owner?.phone ?? null,
      totalOrders: row._count.orders,
      totalMenuItems: row._count.menu,
      totalPromoCodes: row._count.promoCodes,
    };

    return NextResponse.json({ restaurant: detail }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load restaurant",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const v = body as Record<string, unknown>;
  if (typeof v.isSuspended !== "boolean") {
    return NextResponse.json(
      { error: "isSuspended (boolean) is required" },
      { status: 400 },
    );
  }
  const nextSuspended = v.isSuspended;

  try {
    const existing = await prisma.restaurant.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        isSuspended: true,
        deletedAt: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 },
      );
    }
    if (existing.deletedAt !== null) {
      return NextResponse.json(
        { error: "Cannot suspend a soft-deleted restaurant" },
        { status: 409 },
      );
    }
    if (existing.isSuspended === nextSuspended) {
      return NextResponse.json(
        {
          restaurant: { id: existing.id, isSuspended: existing.isSuspended },
          changed: false,
        },
        { status: 200 },
      );
    }

    const updated = await prisma.restaurant.update({
      where: { id: existing.id },
      data: { isSuspended: nextSuspended },
      select: { id: true, isSuspended: true },
    });

    void auditRestaurantSuspend({
      adminUserId: auth.user.id,
      restaurantId: existing.id,
      restaurantName: existing.name,
      wasSuspended: existing.isSuspended,
      nowSuspended: nextSuspended,
    });

    return NextResponse.json(
      { restaurant: updated, changed: true },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update restaurant",
      },
      { status: 500 },
    );
  }
}
