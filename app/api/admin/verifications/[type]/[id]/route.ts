import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

/**
 * PATCH /api/admin/verifications/[type]/[id]
 *
 *   • type=restaurant + id=<restaurantId>
 *   • type=rider      + id=<riderProfileId>
 *
 * Body: { action: "APPROVE" | "REJECT", rejectionReason?: string }
 *
 *   • APPROVE flips verificationStatus to APPROVED, sets
 *     verifiedByAdminId + verifiedAt. The verified restaurant /
 *     rider immediately becomes visible / dispatch-eligible.
 *   • REJECT flips to REJECTED and (optionally) attaches a note
 *     that's surfaced on the partner / rider dashboard.
 *
 * Side effects:
 *   • Notification to the partner (restaurant) or rider (rider).
 *   • AuditLog row recording the action + admin who performed it.
 *
 * Auth: ADMIN only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { type: string; id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { type, id } = params;
  if (type !== "restaurant" && type !== "rider") {
    return NextResponse.json(
      { error: "type must be 'restaurant' or 'rider'" },
      { status: 400 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const v = (body ?? {}) as Record<string, unknown>;
  if (v.action !== "APPROVE" && v.action !== "REJECT") {
    return NextResponse.json(
      { error: "action must be APPROVE or REJECT" },
      { status: 400 },
    );
  }
  const rejectionReason =
    typeof v.rejectionReason === "string" && v.rejectionReason.trim().length > 0
      ? v.rejectionReason.trim().slice(0, 500)
      : null;
  if (v.action === "REJECT" && !rejectionReason) {
    return NextResponse.json(
      { error: "rejectionReason is required when rejecting" },
      { status: 400 },
    );
  }

  const now = new Date();

  try {
    if (type === "restaurant") {
      const target = await prisma.restaurant.findUnique({
        where: { id },
        select: { id: true, name: true, ownerId: true },
      });
      if (!target) {
        return NextResponse.json(
          { error: "Restaurant not found" },
          { status: 404 },
        );
      }
      const updated = await prisma.restaurant.update({
        where: { id },
        data: {
          verificationStatus: v.action === "APPROVE" ? "APPROVED" : "REJECTED",
          verifiedByAdminId: auth.user.id,
          verifiedAt: now,
          rejectionReason: v.action === "REJECT" ? rejectionReason : null,
        },
        select: {
          id: true,
          verificationStatus: true,
          verifiedAt: true,
        },
      });

      // Notify the partner.
      await createNotification(target.ownerId, {
        type: "SYSTEM",
        title:
          v.action === "APPROVE"
            ? `${target.name} is now live`
            : `${target.name} was rejected`,
        message:
          v.action === "APPROVE"
            ? "Customers can now see and order from your restaurant."
            : rejectionReason ?? "Please review and re-submit.",
      });

      // Audit.
      await prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: `RESTAURANT_${v.action}`,
          entityType: "Restaurant",
          entityId: target.id,
          newValue: { verificationStatus: updated.verificationStatus },
        },
      });

      return NextResponse.json(
        { ok: true, restaurant: updated },
        { status: 200 },
      );
    }

    // type === "rider"
    const target = await prisma.riderProfile.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true } },
      },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Rider not found" },
        { status: 404 },
      );
    }
    const updated = await prisma.riderProfile.update({
      where: { id },
      data: {
        verificationStatus: v.action === "APPROVE" ? "APPROVED" : "REJECTED",
        verifiedByAdminId: auth.user.id,
        verifiedAt: now,
        rejectionReason: v.action === "REJECT" ? rejectionReason : null,
      },
      select: {
        id: true,
        verificationStatus: true,
        verifiedAt: true,
      },
    });

    await createNotification(target.userId, {
      type: "SYSTEM",
      title:
        v.action === "APPROVE"
          ? "You're cleared to ride"
          : "Your application was rejected",
      message:
        v.action === "APPROVE"
          ? "Your documents are approved. You can go online now."
          : rejectionReason ?? "Please review and re-submit.",
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: `RIDER_${v.action}`,
        entityType: "RiderProfile",
        entityId: target.id,
        newValue: { verificationStatus: updated.verificationStatus },
      },
    });

    return NextResponse.json({ ok: true, rider: updated }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update verification",
      },
      { status: 500 },
    );
  }
}