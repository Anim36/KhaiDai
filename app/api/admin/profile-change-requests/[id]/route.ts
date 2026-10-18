import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { recordAuditEvent } from "@/lib/audit";

/**
 * PATCH /api/admin/profile-change-requests/[id]
 *
 * Admin approves or rejects a rider's PROFILE_INFO / VEHICLE_INFO
 * change request.
 *
 * Body: { action: "APPROVE" | "REJECT", adminNote?: string }
 *
 *   APPROVE
 *     • status → APPROVED, reviewedAt / reviewedByAdminId set
 *     • PROFILE_INFO → User.profileNeedsReentry = true (rider can
 *       re-fill name / email / phone via PATCH /api/riders/me)
 *     • VEHICLE_INFO → RiderProfile.vehicleNeedsReentry = true
 *       (rider can re-fill vehicleType / vehicleRegNumber)
 *     • Notification: "Your profile change request was approved —
 *       please update your [profile|vehicle] details."
 *
 *   REJECT
 *     • status → REJECTED, adminNote required
 *     • Notification carries the rejection reason to the rider.
 *
 * AuditLog row recorded for both actions.
 *
 * Auth: ADMIN only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = params;

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
  const adminNoteRaw =
    typeof v.adminNote === "string" ? v.adminNote.trim() : "";
  const adminNote =
    adminNoteRaw.length > 0
      ? adminNoteRaw.slice(0, 500)
      : null;
  if (v.action === "REJECT" && !adminNote) {
    return NextResponse.json(
      { error: "adminNote is required when rejecting" },
      { status: 400 },
    );
  }

  const now = new Date();

  try {
    const target = await prisma.profileChangeRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            riderProfile: { select: { id: true } },
          },
        },
        // কাজ ২ — PARTNER requests carry a restaurantId. Pull the
        // restaurant row so APPROVE can flip its needs-reentry flag
        // and we can surface a friendly name in the notification.
        restaurant: {
          select: { id: true, name: true },
        },
      },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Profile change request not found" },
        { status: 404 },
      );
    }
    if (target.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Request is already ${target.status.toLowerCase()}`,
        },
        { status: 409 },
      );
    }

    const newStatus = v.action === "APPROVE" ? "APPROVED" : "REJECTED";

    // Apply the request status + admin note + the matching
    // "needs re-entry" flag in one transaction so the user sees
    // a consistent state.
    await prisma.$transaction(async (tx) => {
      await tx.profileChangeRequest.update({
        where: { id },
        data: {
          status: newStatus,
          reviewedAt: now,
          reviewedByAdminId: auth.user.id,
          adminNote,
        },
      });
      if (v.action === "APPROVE") {
        if (target.requestType === "PROFILE_INFO") {
          await tx.user.update({
            where: { id: target.userId },
            data: { profileNeedsReentry: true },
          });
        } else if (target.requestType === "VEHICLE_INFO") {
          if (!target.user.riderProfile) {
            throw new Error("Rider profile missing for VEHICLE_INFO request");
          }
          await tx.riderProfile.update({
            where: { id: target.user.riderProfile.id },
            data: { vehicleNeedsReentry: true },
          });
        } else if (target.requestType === "RESTAURANT_PROFILE") {
          // কাজ ২ — partner request. The restaurantId was set
          // when the partner submitted the form, so it must be
          // present on a valid PENDING row.
          if (!target.restaurantId || !target.restaurant) {
            throw new Error("Restaurant missing for RESTAURANT_PROFILE request");
          }
          await tx.restaurant.update({
            where: { id: target.restaurantId },
            data: { profileNeedsReentry: true },
          });
        } else if (target.requestType === "RESTAURANT_LOCATION") {
          if (!target.restaurantId || !target.restaurant) {
            throw new Error("Restaurant missing for RESTAURANT_LOCATION request");
          }
          await tx.restaurant.update({
            where: { id: target.restaurantId },
            data: { locationNeedsReentry: true },
          });
        }
      }
    });

    // Human-readable label for the request type. Used in the
    // notification copy + audit row.
    const fieldLabel =
      target.requestType === "PROFILE_INFO"
        ? "profile"
        : target.requestType === "VEHICLE_INFO"
          ? "vehicle"
          : target.requestType === "RESTAURANT_PROFILE"
            ? "restaurant profile"
            : "restaurant location";
    if (v.action === "APPROVE") {
      await createNotification(target.userId, {
        type: "SYSTEM",
        title: "Profile change approved",
        message: `Your request was approved — please update your ${fieldLabel} details from the Settings page.`,
      });
    } else {
      await createNotification(target.userId, {
        type: "SYSTEM",
        title: "Profile change rejected",
        message: adminNote ?? "Please review and resubmit.",
      });
    }

    // Audit.
    await recordAuditEvent({
      userId: auth.user.id,
      action: `PROFILE_CHANGE_REQUEST_${v.action}`,
      entityType: "ProfileChangeRequest",
      entityId: target.id,
      newValue: {
        requestType: target.requestType,
        status: newStatus,
        adminNote,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        request: {
          id: target.id,
          status: newStatus,
          reviewedAt: now.toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("admin profile-change-requests PATCH failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update profile change request",
      },
      { status: 500 },
    );
  }
}