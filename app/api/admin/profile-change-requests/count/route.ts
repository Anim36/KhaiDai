import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/profile-change-requests/count
 *
 * Powers the sidebar badge on /admin/profile-requests — number of
 * PENDING rows across all riders.
 *
 *   200 { count: number }
 *   401 / 403
 *
 * Auth: ADMIN only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const count = await prisma.profileChangeRequest.count({
      where: { status: "PENDING" },
    });
    return NextResponse.json({ count }, { status: 200 });
  } catch (err) {
    console.error("admin profile-change-requests count failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to count profile change requests",
      },
      { status: 500 },
    );
  }
}