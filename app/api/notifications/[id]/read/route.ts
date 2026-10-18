import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { projectNotification } from "@/lib/notifications";

/**
 * PATCH /api/notifications/[id]/read
 *
 * Mark a single notification as read. The notification MUST belong
 * to the signed-in user — we don't accept notification ids from
 * other users (returns 404 to avoid leaking existence).
 *
 * Response:
 *   200 { notification: NotificationDto }
 *   404 not found / not yours
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Use the composite (id, userId) lookup so the "not yours" case
  // is a clean 404 instead of a 403 — clients shouldn't be able
  // to probe for notification ids that don't belong to them.
  const existing = await prisma.notification.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
  return NextResponse.json(
    { notification: projectNotification(updated) },
    { status: 200 },
  );
}
