import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  closeStaleRiderOnlineSessions,
  getOnlineSecondsForDay,
} from "@/lib/rider-hours";

/**
 * GET /api/riders/hours/today
 *
 * Returns the number of seconds the signed-in rider has been
 * online today (Asia/Dhaka local). Single number because the
 * dashboard only needs it for the "Hours online today" tile —
 * other surfaces (admin rider detail) use the multi-day variant
 * via /api/admin/riders/[id]/hours.
 *
 * Side-effect bonus: also closes any stale
 * `RiderOnlineSession` rows so the returned seconds reflect
 * reality.
 *
 * Response: 200 { seconds: number, formatted: "3h 25m" }
 *           401 missing / invalid token
 *           403 wrong role
 *           500 server error
 */

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    await closeStaleRiderOnlineSessions();
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json({ seconds: 0 }, { status: 200 });
    }
    const seconds = await getOnlineSecondsForDay(profile.id, new Date());
    return NextResponse.json({ seconds }, { status: 200 });
  } catch (err) {
    console.error("riders/hours/today failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to compute hours",
      },
      { status: 500 },
    );
  }
}
