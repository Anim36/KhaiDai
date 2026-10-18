import { NextRequest, NextResponse } from "next/server";
import type { PayoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { notifyPayoutStatus } from "@/lib/notifications";

/**
 * PATCH /api/admin/payouts/[id]
 *
 * Update a payout's status. Until a real payout gateway exists,
 * the only role this endpoint plays is "queue status changes"
 * — the on-page admin can flip PENDING → COMPLETED or PENDING →
 * FAILED to indicate a real-world transfer outcome. Today that
 * status change is manual because the gateway integration isn't
 * wired; once it is, the same status changes flow through this
 * route from the gateway webhook.
 *
 * Body (JSON):
 *   { status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" }
 *
 * Behaviour:
 *   • Only the payout row's `status` is mutated. Amount /
 *     destination / note / etc. stay frozen once the row exists.
 *   • A rider-scoped bell notification is fired on every status
 *     change, gated on the rider's `notifyPayout` preference.
 *     A rider who turned the toggle off does not get the bell
 *     row — same control plane as the in-app offers.
 *
 * Responses:
 *   200 { payout: { id, status, updatedAt } }
 *   400 invalid status / no status change
 *   401 missing / invalid token
 *   403 wrong role
 *   404 payout missing
 *   500 server error
 */
const VALID: PayoutStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
];

function isPayoutStatus(value: unknown): value is PayoutStatus {
  return (
    typeof value === "string" &&
    (VALID as readonly string[]).includes(value)
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!isPayoutStatus(raw.status)) {
    return NextResponse.json(
      {
        error:
          "Provide a valid payout status: PENDING, PROCESSING, COMPLETED, or FAILED.",
      },
      { status: 400 },
    );
  }

  const existing = await prisma.payout.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      amount: true,
      riderProfileId: true,
      riderProfile: { select: { userId: true, notifyPayout: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Payout missing" }, { status: 404 });
  }
  if (existing.status === raw.status) {
    return NextResponse.json(
      { error: `Payout is already ${raw.status}` },
      { status: 400 },
    );
  }

  const updated = await prisma.payout.update({
    where: { id },
    data: { status: raw.status },
    select: { id: true, status: true, updatedAt: true },
  });

  // Bell notification for the rider — gated on `notifyPayout`.
  // Restaurant payouts don't have a RiderProfile; in that case
  // we fall back to a plain notification so the partner gets
  // notified (the partner-side equivalent of the same UX).
  if (existing.riderProfile) {
    if (existing.riderProfile.notifyPayout !== false) {
      await notifyPayoutStatus(existing.riderProfile.userId, {
        id: updated.id,
        status: updated.status,
        amount: existing.amount,
      });
    }
  }

  await recordAuditEvent({
    userId: auth.user.id,
    action: "PAYOUT_STATUS_CHANGED",
    entityType: "Payout",
    entityId: updated.id,
    oldValue: { status: existing.status, amount: existing.amount },
    newValue: { status: updated.status, amount: existing.amount },
  });

  return NextResponse.json(
    {
      payout: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
