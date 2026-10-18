import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

/**
 * PATCH /api/notifications/read-all
 *
 * Mark every unread notification for the signed-in user as read in
 * one round-trip. Idempotent — calling twice in a row is a no-op
 * the second time.
 *
 * Response:
 *   200 { updated: number } — count of rows that flipped
 */
export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await prisma.notification.updateMany({
    where: { userId: auth.user.id, isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json(
    { updated: result.count },
    { status: 200 },
  );
}
