import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/audit-log
 *
 * ADMIN-only — read-only viewer over the AuditLog table.
 *
 * Query params:
 *   • `entityType`  filter by entity type ("User" / "Order" / …)
 *   • `action`      filter by action ("ORDER_STATUS_CHANGED", …)
 *   • `from`        ISO date — inclusive lower bound on createdAt
 *   • `to`          ISO date — inclusive upper bound on createdAt
 *   • `q`           search across action / entityType / entityId / actor name
 *   • `page`        1-based, default 1
 *   • `pageSize`    default 50, capped at 200
 *
 * Response:
 *   {
 *     entries: AdminAuditEntry[],
 *     total:   number,
 *     page:    number,
 *     pageSize: number,
 *   }
 *
 * `oldValue` / `newValue` are returned as JSON — the client pretty-
 * prints them in the modal.
 */

type AdminAuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const entityTypeParam = url.searchParams.get("entityType")?.trim() ?? "";
  const actionParam = url.searchParams.get("action")?.trim() ?? "";
  const fromParam = url.searchParams.get("from") ?? "";
  const toParam = url.searchParams.get("to") ?? "";
  const qParam = url.searchParams.get("q")?.trim() ?? "";
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "50");

  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Math.min(
    200,
    Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 50),
  );

  const where: Record<string, unknown> = {};
  if (entityTypeParam.length > 0) where.entityType = entityTypeParam;
  if (actionParam.length > 0) where.action = actionParam;

  const createdAt: Record<string, Date> = {};
  if (fromParam) {
    const d = new Date(fromParam);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (toParam) {
    const d = new Date(toParam);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

  if (qParam.length > 0) {
    where.OR = [
      { action: { contains: qParam, mode: "insensitive" } },
      { entityType: { contains: qParam, mode: "insensitive" } },
      { entityId: { contains: qParam } },
      {
        user: {
          is: { name: { contains: qParam, mode: "insensitive" } },
        },
      },
      {
        user: {
          is: { email: { contains: qParam, mode: "insensitive" } },
        },
      },
    ];
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const entries: AdminAuditEntry[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      oldValue: r.oldValue,
      newValue: r.newValue,
      createdAt: r.createdAt.toISOString(),
      actor: r.user
        ? {
            id: r.user.id,
            name: r.user.name,
            email: r.user.email,
            role: r.user.role,
          }
        : null,
    }));

    return NextResponse.json(
      { entries, total, page, pageSize },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list audit entries",
      },
      { status: 500 },
    );
  }
}
