import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/profile-change-requests?status=PENDING|APPROVED|REJECTED
 *
 * Powers the admin Profile Requests queue at /admin/profile-requests.
 *
 *   200 {
 *     status, total,
 *     requests: [
 *       { id, requestType, status, note, createdAt, reviewedAt, adminNote,
 *         rider: { id, name, email, phone, vehicleType, vehicleRegNumber } }
 *     ]
 *   }
 *   401 / 403 / 400
 *
 * Auth: ADMIN only.
 */
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const ROLES = new Set(["RIDER", "PARTNER"]);

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const params = new URL(req.url).searchParams;
  const statusParam = (params.get("status") ?? "PENDING").toUpperCase();
  if (!STATUSES.has(statusParam)) {
    return NextResponse.json(
      { error: "status must be PENDING | APPROVED | REJECTED" },
      { status: 400 },
    );
  }
  const status = statusParam as "PENDING" | "APPROVED" | "REJECTED";
  // কাজ ২ — optional `role` filter. The admin can narrow the
  // queue to just RIDER or PARTNER requests. Default is "ALL"
  // (no extra where clause).
  const roleParam = (params.get("role") ?? "ALL").toUpperCase();
  const roleWhere =
    ROLES.has(roleParam)
      ? { role: roleParam as "RIDER" | "PARTNER" }
      : {};

  try {
    const [rows, total] = await Promise.all([
      prisma.profileChangeRequest.findMany({
        where: { status, ...roleWhere },
        orderBy: [{ createdAt: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              riderProfile: {
                select: {
                  id: true,
                  vehicleType: true,
                  vehicleRegNumber: true,
                },
              },
            },
          },
          // কাজ ২ — partner requests carry a restaurant row; the
          // admin queue surfaces the restaurant name + cuisine so
          // the reviewer knows which storefront the change applies
          // to without a second lookup.
          restaurant: {
            select: { id: true, name: true, cuisine: true },
          },
        },
        take: 100,
      }),
      prisma.profileChangeRequest.count({ where: { status, ...roleWhere } }),
    ]);

    return NextResponse.json(
      {
        status,
        total,
        requests: rows.map((r) => ({
          id: r.id,
          role: r.role,
          requestType: r.requestType,
          status: r.status,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          adminNote: r.adminNote,
          requester: {
            id: r.user.id,
            name: r.user.name,
            email: r.user.email,
            phone: r.user.phone,
            // কাজ ২ — for RIDER requests we keep the original
            // vehicle fields so existing UI continues to work.
            // The unified key is `requester`.
            vehicleType: r.user.riderProfile?.vehicleType ?? null,
            vehicleRegNumber:
              r.user.riderProfile?.vehicleRegNumber ?? null,
          },
          // কাজ ২ — for PARTNER requests. Null on RIDER rows.
          restaurant: r.restaurant
            ? {
                id: r.restaurant.id,
                name: r.restaurant.name,
                cuisine: r.restaurant.cuisine,
              }
            : null,
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("admin profile-change-requests list failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to list profile change requests",
      },
      { status: 500 },
    );
  }
}