import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * PATCH /api/admin/messages/[id]
 *
 * Marks a single contact message as read. Idempotent — calling
 * twice is a no-op (the row already has isRead=true).
 *
 * We don't expose a DELETE here; the contact row is a compliance
 * record of inbound correspondence and admins shouldn't casually
 * nuke it. If a future feature wants archive semantics, it should
 * route through a separate, audited endpoint.
 *
 * Auth: ADMIN only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const updated = await prisma.contactMessage.update({
      where: { id: params.id },
      data: { isRead: true },
      select: { id: true, isRead: true },
    });
    return NextResponse.json(
      { id: updated.id, isRead: updated.isRead },
      { status: 200 },
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to mark message read";
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}