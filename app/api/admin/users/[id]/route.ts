import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { auditUserSuspend } from "@/lib/audit";

/**
 * GET  /api/admin/users/[id] — full user detail.
 * PATCH /api/admin/users/[id] — toggle `isSuspended`.
 *
 * Both ADMIN-only. The toggle records an audit row so the
 * moderation action shows up on `/admin/audit-log` with the
 * admin's id + the before/after flag.
 */

type AdminUserDetail = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isSuspended: boolean;
  createdAt: string;
  joinedLabel: string;
  /** Counters useful for the detail modal. */
  orderCount: number;
  restaurantCount: number;
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
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isSuspended: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Two cheap counts to populate the detail modal. Both filtered
    // by userId so they line up with the row's role (a CUSTOMER
    // has zero restaurants, etc.).
    const orderCount = await prisma.order.count({
      where: { customerId: user.id },
    });
    const restaurantCount = await prisma.restaurant.count({
      where: { ownerId: user.id, deletedAt: null },
    });

    const detail: AdminUserDetail = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isSuspended: user.isSuspended,
      createdAt: user.createdAt.toISOString(),
      joinedLabel: user.createdAt.toISOString().slice(0, 10),
      orderCount,
      restaurantCount,
    };
    return NextResponse.json({ user: detail }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load user",
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

  // The only field ADMIN can mutate from this endpoint right now.
  // Body must contain `{ isSuspended: boolean }` — we refuse partial
  // / unknown payloads so a future schema field can opt in cleanly.
  if (typeof v.isSuspended !== "boolean") {
    return NextResponse.json(
      { error: "isSuspended (boolean) is required" },
      { status: 400 },
    );
  }
  const nextSuspended = v.isSuspended;

  try {
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        role: true,
        isSuspended: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Idempotent no-op — if the flag is already in the desired state,
    // skip both the write and the audit row.
    if (existing.isSuspended === nextSuspended) {
      return NextResponse.json(
        {
          user: {
            id: existing.id,
            isSuspended: existing.isSuspended,
          },
          changed: false,
        },
        { status: 200 },
      );
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { isSuspended: nextSuspended },
      select: { id: true, isSuspended: true },
    });

    void auditUserSuspend({
      adminUserId: auth.user.id,
      targetUserId: existing.id,
      targetEmail: existing.email,
      targetRole: existing.role,
      wasSuspended: existing.isSuspended,
      nowSuspended: nextSuspended,
    });

    return NextResponse.json(
      { user: updated, changed: true },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update user",
      },
      { status: 500 },
    );
  }
}
