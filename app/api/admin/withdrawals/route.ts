// /api/admin/withdrawals
//
// Feat 5 — admin-side withdrawal review queue.
//
//   • GET — list every WithdrawalRequest (customer) + every Payout
//     (partner + rider), newest first, optionally filtered by status
//     and/or role. Pagination via `page` / `pageSize`.
//   • PATCH — approve / reject a single request.
//
//   Response shapes:
//
//     GET 200 {
//       items: AdminWithdrawalRow[],
//       counts: { customer: {pending, approved, rejected},
//                 partner:  {pending, approved, rejected},
//                 rider:    {pending, approved, rejected} },
//       total: number,
//       page: number,
//       pageSize: number,
//     }
//
//     PATCH 200 { item: AdminWithdrawalRow }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  refundWithdrawal,
} from "@/lib/wallet";
import { createNotification } from "@/lib/notifications";

type RoleFilter = "ALL" | "CUSTOMER" | "PARTNER" | "RIDER";
type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

type AdminWithdrawalRow = {
  id: string;
  source: "WITHDRAWAL_REQUEST" | "PAYOUT";
  role: "CUSTOMER" | "PARTNER" | "RIDER";
  amount: number;
  payoutMethod: string;
  payoutDestination: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  user: { id: string; name: string; email: string };
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
};

function normalizePayoutStatus(
  s: string,
): "PENDING" | "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED" | "FAILED" {
  if (
    s === "PENDING" ||
    s === "APPROVED" ||
    s === "REJECTED" ||
    s === "PROCESSING" ||
    s === "COMPLETED" ||
    s === "FAILED"
  ) {
    return s;
  }
  return "PENDING";
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const role = (url.searchParams.get("role") ?? "ALL").toUpperCase() as RoleFilter;
  const status = (url.searchParams.get("status") ?? "ALL").toUpperCase() as StatusFilter;
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "25");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Math.min(
    100,
    Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 25),
  );

  // Build the role-and-status filters.
  const wantRoles: Array<"CUSTOMER" | "PARTNER" | "RIDER"> =
    role === "ALL" ? ["CUSTOMER", "PARTNER", "RIDER"] : [role];

  // 1) Customer rows from WithdrawalRequest.
  const wantCustomer = wantRoles.includes("CUSTOMER");
  const wrs = wantCustomer
    ? await prisma.withdrawalRequest.findMany({
        where: {
          status: status === "ALL" ? undefined : (status as "PENDING" | "APPROVED" | "REJECTED"),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const wrRows: AdminWithdrawalRow[] = wrs.map((w) => ({
    id: w.id,
    source: "WITHDRAWAL_REQUEST",
    role: "CUSTOMER",
    amount: w.amount,
    payoutMethod: w.payoutMethod,
    payoutDestination: w.payoutDestination,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    user: w.user,
    rejectionReason: w.rejectionReason,
    reviewedAt: w.reviewedAt ? w.reviewedAt.toISOString() : null,
    reviewedByAdminId: w.reviewedByAdminId,
  }));

  // 2) Partner + Rider rows from Payout. We map PayoutStatus
  //    (PENDING/PROCESSING/COMPLETED/FAILED) onto the same
  //    status buckets the admin UI cares about.
  const wantPartner = wantRoles.includes("PARTNER");
  const wantRider = wantRoles.includes("RIDER");
  const payoutWhere: Record<string, unknown> = {};
  // Payout's statuses are different (PROCESSING/COMPLETED/FAILED
  // are not on WithdrawalRequest). We map the requested status to
  // a payout-side filter: status=APPROVED → COMPLETED;
  // status=REJECTED → FAILED; status=PENDING → PENDING+PROCESSING.
  if (status === "PENDING") {
    payoutWhere.status = { in: ["PENDING", "PROCESSING"] };
  } else if (status === "APPROVED") {
    payoutWhere.status = "COMPLETED";
  } else if (status === "REJECTED") {
    payoutWhere.status = "FAILED";
  }

  const payouts = await prisma.payout.findMany({
    where:
      wantPartner && !wantRider
        ? { ...payoutWhere, restaurantId: { not: null } }
        : wantRider && !wantPartner
          ? { ...payoutWhere, riderProfileId: { not: null } }
          : wantPartner || wantRider
            ? {
                ...payoutWhere,
                OR: [
                  { restaurantId: { not: null } },
                  { riderProfileId: { not: null } },
                ],
              }
            : { id: "never" }, // skip
    include: {
      // The Payout model links either to a Restaurant (PARTNER) or
      // a RiderProfile (RIDER). For the admin row we want the
      // requesting user's id+name+email, so we expand the
      // Restaurant.owner and RiderProfile.user.
      restaurant: {
        select: { owner: { select: { id: true, name: true, email: true } } },
      },
      riderProfile: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const payoutRows: AdminWithdrawalRow[] = payouts
    .filter((p) => {
      if (wantPartner && wantRider) return true;
      if (wantPartner) return p.restaurantId !== null;
      if (wantRider) return p.riderProfileId !== null;
      return false;
    })
    .map((p) => {
      const isPartner = p.restaurantId !== null;
      const role: "PARTNER" | "RIDER" = isPartner ? "PARTNER" : "RIDER";
      const u = isPartner ? p.restaurant?.owner : p.riderProfile?.user;
      return {
        id: p.id,
        source: "PAYOUT" as const,
        role,
        amount: p.amount,
        payoutMethod: p.method,
        payoutDestination: p.destination,
        status: normalizePayoutStatus(p.status),
        createdAt: p.createdAt.toISOString(),
        user: {
          id: u?.id ?? "",
          name: u?.name ?? "—",
          email: u?.email ?? "—",
        },
        rejectionReason: p.note ?? null,
        reviewedAt: null,
        reviewedByAdminId: null,
      };
    });

  // Combine, sort, paginate.
  const combined: AdminWithdrawalRow[] = [...wrRows, ...payoutRows].sort(
    (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
  );
  const total = combined.length;
  const items = combined.slice((page - 1) * pageSize, page * pageSize);

  // Counts per role.
  const [custPending, custApproved, custRejected, payPending, payApproved, payRejected] =
    await Promise.all([
      prisma.withdrawalRequest.count({ where: { status: "PENDING" } }),
      prisma.withdrawalRequest.count({ where: { status: "APPROVED" } }),
      prisma.withdrawalRequest.count({ where: { status: "REJECTED" } }),
      prisma.payout.count({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
      }),
      prisma.payout.count({ where: { status: "COMPLETED" } }),
      prisma.payout.count({ where: { status: "FAILED" } }),
    ]);

  return NextResponse.json(
    {
      items,
      total,
      page,
      pageSize,
      counts: {
        customer: {
          pending: custPending,
          approved: custApproved,
          rejected: custRejected,
        },
        partner: {
          pending: payPending,
          approved: payApproved,
          rejected: payRejected,
        },
        rider: {
          pending: payPending,
          approved: payApproved,
          rejected: payRejected,
        },
      },
    },
    { status: 200 },
  );
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const patch = body as Record<string, unknown>;
  const id = patch.id;
  const decision = patch.decision;
  const rejectionReason = patch.rejectionReason;

  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (decision !== "APPROVE" && decision !== "REJECT") {
    return NextResponse.json(
      { error: "decision must be APPROVE or REJECT" },
      { status: 400 },
    );
  }
  if (decision === "REJECT" && (typeof rejectionReason !== "string" || rejectionReason.trim().length < 3)) {
    return NextResponse.json(
      { error: "rejectionReason is required when rejecting" },
      { status: 400 },
    );
  }

  // Look up the request.
  const wr = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!wr) {
    return NextResponse.json(
      { error: "Withdrawal request not found" },
      { status: 404 },
    );
  }
  if (wr.status !== "PENDING") {
    return NextResponse.json(
      { error: `Cannot review a request in status ${wr.status}.` },
      { status: 409 },
    );
  }

  try {
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      if (decision === "APPROVE") {
        // Mark as APPROVED — money stays debited (admin's external
        // payout pipeline picks it up; we only track status here).
        return tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "APPROVED",
            reviewedByAdminId: auth.user.id,
            reviewedAt: now,
          },
        });
      } else {
        // REJECT — restore the wallet balance, log the decision.
        const profile = await tx.customerProfile.findUnique({
          where: { userId: wr.userId },
          select: { id: true },
        });
        if (profile) {
          await refundWithdrawal(tx, {
            customerProfileId: profile.id,
            amount: wr.amount,
            description: `Withdrawal rejected — ৳${wr.amount.toLocaleString()} returned to wallet`,
          });
        }
        return tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            reviewedByAdminId: auth.user.id,
            reviewedAt: now,
            rejectionReason:
              (rejectionReason as string).trim() || "Rejected by admin",
          },
        });
      }
    });

    void recordAuditEvent({
      userId: auth.user.id,
      action:
        decision === "APPROVE"
          ? "WITHDRAWAL_REQUEST_APPROVED"
          : "WITHDRAWAL_REQUEST_REJECTED",
      entityType: "WithdrawalRequest",
      entityId: updated.id,
      oldValue: { status: wr.status },
      newValue: {
        status: updated.status,
        amount: wr.amount,
        userId: wr.userId,
        rejectionReason:
          decision === "REJECT" ? (rejectionReason as string).trim() : null,
      },
    });

    void createNotification(wr.userId, {
      title: decision === "APPROVE" ? "Withdrawal approved" : "Withdrawal rejected",
      message:
        decision === "APPROVE"
          ? `Your withdrawal of ৳${wr.amount.toLocaleString()} was approved. The payout is on its way to your ${wr.payoutMethod} account.`
          : `Your withdrawal of ৳${wr.amount.toLocaleString()} was rejected. The full amount has been returned to your KhaiDai Wallet.${
              rejectionReason ? ` Reason: ${(rejectionReason as string).trim()}` : ""
            }`,
      type: "SYSTEM",
    });

    return NextResponse.json(
      {
        item: {
          id: updated.id,
          status: updated.status,
          reviewedAt: updated.reviewedAt?.toISOString() ?? null,
          rejectionReason: updated.rejectionReason,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update request",
      },
      { status: 500 },
    );
  }
}