import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/messages
 *
 * Lists every contact-form submission, newest first, with the
 * optional `?unread=1` filter (powers the admin sidebar badge
 * + an "Unread" tab in the messages page). Read state is flipped
 * lazily when the admin opens a row in the UI (PATCH below).
 *
 * Auth: ADMIN only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  try {
    const [rows, unreadCount] = await Promise.all([
      prisma.contactMessage.findMany({
        where: unreadOnly ? { isRead: false } : undefined,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.contactMessage.count({ where: { isRead: false } }),
    ]);

    return NextResponse.json(
      {
        messages: rows.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          message: m.message,
          isRead: m.isRead,
          createdAt: m.createdAt.toISOString(),
        })),
        unreadCount,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list messages",
      },
      { status: 500 },
    );
  }
}