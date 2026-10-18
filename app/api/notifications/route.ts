import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, verifyAuth } from "@/lib/auth";
import {
  notificationsWhere,
  projectNotification,
} from "@/lib/notifications";

/**
 * GET /api/notifications
 *
 * Returns the signed-in user's notifications, newest first.
 *
 * Query params:
 *   ?unread=true   — restrict to unread rows
 *   ?limit=<n>     — 1..100, default 25
 *
 * Auth: any signed-in user.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "25", 10) || 25, 1),
    100,
  );

  const rows = await prisma.notification.findMany({
    where: notificationsWhere(auth.user.id, unreadOnly),
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: auth.user.id, isRead: false },
  });

  return NextResponse.json(
    {
      notifications: rows.map(projectNotification),
      unreadCount,
    },
    { status: 200 },
  );
}

/**
 * POST /api/notifications
 *
 * Server-internal endpoint used by other API routes to fan out
 * notification rows. Body:
 *   { userId: string, title: string, message?: string,
 *     type?: "ORDER_UPDATE" | "PROMOTION" | "SYSTEM",
 *     relatedOrderId?: string }
 *
 * We restrict this to authenticated callers (so it's never
 * reachable anonymously) but don't gate by role — the same server
 * emits notifications for all three roles. Cross-user writes are
 * allowed only when the caller is staff or the route that called
 * us already validated ownership.
 *
 * Returns:
 *   201 { notification: NotificationDto }
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const userId = typeof b.userId === "string" ? b.userId : null;
  const title = typeof b.title === "string" ? b.title.trim() : null;
  if (!userId || !title) {
    return NextResponse.json(
      { error: "userId and title are required" },
      { status: 400 },
    );
  }
  if (title.length > 200) {
    return NextResponse.json(
      { error: "title too long (max 200)" },
      { status: 400 },
    );
  }

  const message =
    typeof b.message === "string" ? b.message.trim().slice(0, 1000) : null;

  const type =
    b.type === "ORDER_UPDATE" || b.type === "PROMOTION" || b.type === "SYSTEM"
      ? b.type
      : "SYSTEM";
  const relatedOrderId =
    typeof b.relatedOrderId === "string" ? b.relatedOrderId.slice(0, 64) : null;

  // Ensure the target user exists. Catching a FK error post-insert
  // is messier than a cheap existence check up-front.
  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const created = await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type,
      relatedOrderId,
    },
  });
  return NextResponse.json(
    { notification: projectNotification(created) },
    { status: 201 },
  );
}
