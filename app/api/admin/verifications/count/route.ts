import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/verifications/count
 *
 * Combined PENDING count of restaurants + riders. Powers the
 * sidebar badge so an admin opening the dashboard immediately
 * sees how many approvals need attention.
 *
 * Auth: ADMIN only.
 * Response: { count: number }
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const [restaurants, riders] = await Promise.all([
    prisma.restaurant.count({
      where: { verificationStatus: "PENDING", deletedAt: null },
    }),
    prisma.riderProfile.count({
      where: { verificationStatus: "PENDING" },
    }),
  ]);
  return NextResponse.json(
    { count: restaurants + riders },
    { status: 200 },
  );
}