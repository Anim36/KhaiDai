import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/admin/verifications?type=restaurant|rider&status=pending|approved|rejected&page=1
 *
 * Powers the /admin/verifications queue.
 *
 *   type=restaurant -> list Restaurant rows
 *   type=rider      -> list RiderProfile rows
 *
 * Documents are included for the detail-view render. We deliberately
 * return the raw data URLs — the admin view needs the inline image
 * preview. Production would swap this for signed-URL fetches.
 *
 * Auth: ADMIN only.
 */
const TYPES = new Set(["restaurant", "rider"]);
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "restaurant";
  if (!TYPES.has(type)) {
    return NextResponse.json(
      { error: "type must be 'restaurant' or 'rider'" },
      { status: 400 },
    );
  }
  const statusParam = (url.searchParams.get("status") ?? "PENDING").toUpperCase();
  if (!STATUSES.has(statusParam)) {
    return NextResponse.json(
      { error: "status must be PENDING | APPROVED | REJECTED" },
      { status: 400 },
    );
  }
  const status = statusParam as "PENDING" | "APPROVED" | "REJECTED";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 50;

  try {
    if (type === "restaurant") {
      const [rows, total] = await Promise.all([
        prisma.restaurant.findMany({
          where: { verificationStatus: status, deletedAt: null },
          orderBy: [{ createdAt: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            owner: {
              select: { id: true, name: true, email: true, phone: true },
            },
            documents: { orderBy: { uploadedAt: "asc" } },
          },
        }),
        prisma.restaurant.count({
          where: { verificationStatus: status, deletedAt: null },
        }),
      ]);
      return NextResponse.json(
        {
          type,
          status,
          page,
          pageSize,
          total,
          restaurants: rows.map((r) => ({
            id: r.id,
            name: r.name,
            cuisine: r.cuisine,
            address: r.address,
            createdAt: r.createdAt.toISOString(),
            verifiedAt: r.verifiedAt?.toISOString() ?? null,
            rejectionReason: r.rejectionReason ?? null,
            owner: r.owner,
            documents: r.documents.map((d) => ({
              id: d.id,
              documentType: d.documentType,
              fileUrl: d.fileUrl,
              uploadedAt: d.uploadedAt.toISOString(),
            })),
          })),
        },
        { status: 200 },
      );
    }

    // type === "rider"
    const [rows, total] = await Promise.all([
      prisma.riderProfile.findMany({
        where: { verificationStatus: status },
        orderBy: [{ createdAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              createdAt: true,
            },
          },
          documents: { orderBy: { uploadedAt: "asc" } },
        },
      }),
      prisma.riderProfile.count({
        where: { verificationStatus: status },
      }),
    ]);
    return NextResponse.json(
      {
        type,
        status,
        page,
        pageSize,
        total,
        riders: rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          vehicleType: r.vehicleType,
          vehicleRegNumber: r.vehicleRegNumber,
          verifiedAt: r.verifiedAt?.toISOString() ?? null,
          rejectionReason: r.rejectionReason ?? null,
          submittedAt: r.user.createdAt.toISOString(),
          user: {
            id: r.user.id,
            name: r.user.name,
            email: r.user.email,
            phone: r.user.phone,
          },
          documents: r.documents.map((d) => ({
            id: d.id,
            documentType: d.documentType,
            fileUrl: d.fileUrl,
            uploadedAt: d.uploadedAt.toISOString(),
          })),
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to list verification queue",
      },
      { status: 500 },
    );
  }
}