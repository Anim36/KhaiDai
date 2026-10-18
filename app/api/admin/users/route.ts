import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/users
 *
 * ADMIN-only — paginated user list for /admin/users.
 *
 * Query params:
 *   • `role`     filter by `UserRole` enum (optional)
 *   • `q`        free-text search across `name` / `email` / `phone`
 *                (case-insensitive, substring match)
 *   • `suspended` "true" | "false" — restrict to one bucket
 *   • `page`     1-based page index, default 1
 *   • `pageSize` default 25, capped at 100
 *
 * Response:
 *   {
 *     users: AdminUserRow[],
 *     total: number,
 *     page: number,
 *     pageSize: number,
 *   }
 *
 * Soft-deleted users are excluded by default — they're owned by
 * the GDPR flow, not the moderation flow.
 */

const ROLE_VALUES = ["CUSTOMER", "PARTNER", "RIDER", "ADMIN"] as const;

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isSuspended: boolean;
  createdAt: string;
  /** Best-effort "joined date" label rendered on the table. */
  joinedLabel: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const roleParam = url.searchParams.get("role");
  const qParam = url.searchParams.get("q")?.trim() ?? "";
  const suspendedParam = url.searchParams.get("suspended");
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "25");

  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Math.min(
    100,
    Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 25),
  );

  const where: Record<string, unknown> = { deletedAt: null };
  if (roleParam && (ROLE_VALUES as readonly string[]).includes(roleParam)) {
    where.role = roleParam;
  }
  if (suspendedParam === "true") where.isSuspended = true;
  else if (suspendedParam === "false") where.isSuspended = false;

  if (qParam.length > 0) {
    // OR-combined case-insensitive search across the three text
    // columns. Prisma's `contains` + `mode: "insensitive"` keeps the
    // query portable to Postgres without raw SQL.
    where.OR = [
      { name: { contains: qParam, mode: "insensitive" } },
      { email: { contains: qParam, mode: "insensitive" } },
      { phone: { contains: qParam, mode: "insensitive" } },
    ];
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isSuspended: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const users: AdminUserRow[] = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      isSuspended: u.isSuspended,
      createdAt: u.createdAt.toISOString(),
      joinedLabel: u.createdAt.toISOString().slice(0, 10),
    }));

    return NextResponse.json({ users, total, page, pageSize }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list users",
      },
      { status: 500 },
    );
  }
}
