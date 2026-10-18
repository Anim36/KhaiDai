import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  closeStaleRiderOnlineSessions,
  getOnlineSecondsPerDay,
} from "@/lib/rider-hours";

/**
 * GET /api/admin/riders/[id]/hours?days=30
 *
 * Admin-only. Returns one row per day (Asia/Dhaka calendar day)
 * for the trailing `days` window with the seconds the rider was
 * online each day. The admin rider detail page renders this as
 * a 30-row table beneath the hourly dashboard graph.
 *
 *   200 { days: number, hoursPerDay: Array<{ date, seconds }> }
 *   401 / 403 / 404 / 500
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const days = Math.max(
    1,
    Math.min(90, Number(new URL(req.url).searchParams.get("days") ?? 30)),
  );

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: params.id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Rider not found" }, { status: 404 });
  }
  await closeStaleRiderOnlineSessions();
  const rows = await getOnlineSecondsPerDay(profile.id, days);
  return NextResponse.json({ days, hoursPerDay: rows }, { status: 200 });
}
