// POST /api/wallet/withdraw-request
//
// Feat 5 — customer-side wallet withdrawal.
//
// Body: {
//   amount: number,
//   payoutMethod: "BKASH" | "NAGAD" | "ROCKET" | "CARD",
//   payoutDestination: string,
// }
//
// Behaviour:
//   • CUSTOMER role only (403 otherwise).
//   • Validates amount > 0 and ≤ wallet.balance. Server-trusted;
//     client-supplied amounts are never trusted.
//   • Debits the wallet immediately (via `debitForWithdrawal`) so
//     the same balance can't be spent twice. If the admin rejects,
//     `refundWithdrawal` restores it.
//   • Creates a WithdrawalRequest row with status=PENDING.
//   • Notifies the user that the request is under review.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import {
  debitForWithdrawal,
  getOrCreateWallet,
} from "@/lib/wallet";
import { createNotification } from "@/lib/notifications";

const ALLOWED_METHODS = ["BKASH", "NAGAD", "ROCKET", "CARD"] as const;
type AllowedMethod = (typeof ALLOWED_METHODS)[number];
function isAllowedMethod(s: unknown): s is AllowedMethod {
  return typeof s === "string" && (ALLOWED_METHODS as readonly string[]).includes(s);
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Only customers can request a wallet withdrawal." },
      { status: 403 },
    );
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
  const amount = patch.amount;
  const payoutMethod = patch.payoutMethod;
  const payoutDestination = patch.payoutDestination;

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(amount)
  ) {
    return NextResponse.json(
      { error: "amount must be a positive integer." },
      { status: 400 },
    );
  }
  if (!isAllowedMethod(payoutMethod)) {
    return NextResponse.json(
      {
        error:
          "payoutMethod must be one of " + ALLOWED_METHODS.join(", "),
      },
      { status: 400 },
    );
  }
  if (
    typeof payoutDestination !== "string" ||
    payoutDestination.trim().length < 3
  ) {
    return NextResponse.json(
      { error: "payoutDestination is required." },
      { status: 400 },
    );
  }

  const profile = await prisma.customerProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Customer profile not found." },
      { status: 404 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, profile.id);
      if (amount > wallet.balance) {
        const e: Error & { httpStatus?: number } = new Error(
          "Amount exceeds your wallet balance.",
        );
        e.httpStatus = 409;
        throw e;
      }
      // Debit the wallet immediately (Feat 5 — simpler than tracking
      // "held" balance; the admin's reject path restores it).
      await debitForWithdrawal(tx, {
        customerProfileId: profile.id,
        amount,
        description: `Withdrawal request — payout to ${payoutMethod} ${payoutDestination}`,
      });
      const wr = await tx.withdrawalRequest.create({
        data: {
          userId: auth.user.id,
          role: "CUSTOMER",
          amount,
          sourceType: "WALLET",
          payoutMethod,
          payoutDestination,
          status: "PENDING",
        },
        select: {
          id: true,
          amount: true,
          payoutMethod: true,
          status: true,
          createdAt: true,
        },
      });
      return wr;
    });

    void createNotification(auth.user.id, {
      title: "Withdrawal request received",
      message: `Your withdrawal request for ৳${result.amount.toLocaleString()} is pending admin review.`,
      type: "SYSTEM",
    });

    return NextResponse.json(
      {
        ok: true,
        withdrawalRequest: {
          id: result.id,
          amount: result.amount,
          payoutMethod: result.payoutMethod,
          status: result.status,
          createdAt: result.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const status =
      typeof (err as { status?: number })?.status === "number"
        ? (err as { status?: number }).status
        : typeof (err as { httpStatus?: number })?.httpStatus === "number"
          ? (err as { httpStatus?: number }).httpStatus
          : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create withdrawal request.",
      },
      { status },
    );
  }
}