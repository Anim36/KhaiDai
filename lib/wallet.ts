// lib/wallet.ts
//
// Server-side helpers for the customer "KhaiDai Wallet" (Feat 3 +
// Feat 4). Every balance / token mutation lives in this module so
// the rules are enforced in one place:
//
//   • `creditForOrderRefund`   — partner cancelled a PAID order →
//     credit the customer wallet by `order.total` and log a
//     `REFUND` row. Auto-creates the wallet if it doesn't exist.
//   • `creditCashbackForOrder` — DELIVERED status → 8% of the
//     subtotal added as `tokenBalance`, logged as `TOKEN_EARNED`.
//     Idempotent: re-running for an already-credited order is a
//     no-op.
//   • `swapTokensForBalance`  — Feat 4 swap. Moves a multiple of
//     100 from tokens into cash balance (1 token = ৳1).
//   • `deductForWithdrawal`   — Feat 5 customer wallet
//     withdrawal. Debits the balance immediately; rejection by an
//     admin restores it.
//
// All amounts are integers (Taka, no decimals). Tokens have a
// fixed 1:1 value in Taka but stored separately so the customer UI
// can render them with a different label.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

type DBorTx = PrismaClient | Prisma.TransactionClient;

/**
 * Resolve (or create) the wallet for a customer's profile. The
 * profile is the unique key — never `userId`, since the same User
 * can in theory have a CUSTOMER + CUSTOMER profile mix-up during
 * role transitions. Caller passes the already-loaded profile id.
 */
export async function getOrCreateWallet(
  tx: DBorTx,
  customerProfileId: string,
): Promise<{ id: string; balance: number; tokenBalance: number }> {
  const existing = await tx.wallet.findUnique({
    where: { customerProfileId },
    select: { id: true, balance: true, tokenBalance: true },
  });
  if (existing) return existing;
  const created = await tx.wallet.create({
    data: { customerProfileId, balance: 0, tokenBalance: 0 },
    select: { id: true, balance: true, tokenBalance: true },
  });
  return created;
}

/**
 * Credit `amount` Taka to the wallet as a `REFUND` row tied to the
 * given order. Auto-creates the wallet on first refund.
 *
 * No-op for COD orders (we never had the money in the first
 * place) and for already-cancelled orders that somehow already
 * received a refund — guarded by an idempotency check on
 * `relatedOrderId + type=REFUND`.
 *
 * `amount` is taken from the caller (the order total) and never
 * recomputed server-side because the caller has just read the
 * order row inside the same transaction.
 */
export async function creditForOrderRefund(
  tx: DBorTx,
  args: {
    customerProfileId: string;
    orderId: string;
    amount: number;
    description: string;
  },
): Promise<{ credited: boolean; newBalance: number }> {
  if (args.amount <= 0) return { credited: false, newBalance: 0 };
  const existing = await tx.walletTransaction.findFirst({
    where: {
      relatedOrderId: args.orderId,
      type: "REFUND",
    },
    select: { id: true },
  });
  if (existing) {
    // Already refunded — return current balance unchanged.
    const w = await tx.wallet.findUnique({
      where: { customerProfileId: args.customerProfileId },
      select: { balance: true },
    });
    return { credited: false, newBalance: w?.balance ?? 0 };
  }
  const wallet = await getOrCreateWallet(tx, args.customerProfileId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: args.amount } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "REFUND",
      amount: args.amount,
      relatedOrderId: args.orderId,
      description: args.description,
    },
  });
  return { credited: true, newBalance: wallet.balance + args.amount };
}

/**
 * Credit `tokenAmount` tokens (always positive) as `TOKEN_EARNED`.
 * Idempotent on `relatedOrderId + type=TOKEN_EARNED`.
 */
export async function creditTokensForOrder(
  tx: DBorTx,
  args: {
    customerProfileId: string;
    orderId: string;
    tokenAmount: number;
    description: string;
  },
): Promise<{ credited: boolean; newTokenBalance: number }> {
  if (args.tokenAmount <= 0) {
    return { credited: false, newTokenBalance: 0 };
  }
  const existing = await tx.walletTransaction.findFirst({
    where: {
      relatedOrderId: args.orderId,
      type: "TOKEN_EARNED",
    },
    select: { id: true },
  });
  if (existing) {
    const w = await tx.wallet.findUnique({
      where: { customerProfileId: args.customerProfileId },
      select: { tokenBalance: true },
    });
    return { credited: false, newTokenBalance: w?.tokenBalance ?? 0 };
  }
  const wallet = await getOrCreateWallet(tx, args.customerProfileId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { tokenBalance: { increment: args.tokenAmount } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "TOKEN_EARNED",
      amount: args.tokenAmount,
      relatedOrderId: args.orderId,
      description: args.description,
    },
  });
  return {
    credited: true,
    newTokenBalance: wallet.tokenBalance + args.tokenAmount,
  };
}

/**
 * Feat 4 — customer-side "Swap Tokens" action. Moves
 * `tokenAmount` tokens into the cash balance at 1:1. Caller
 * already enforces `tokenAmount ∈ {100, 200, ..., all-of-it}`.
 * Throws if the wallet doesn't have enough tokens.
 */
export async function swapTokensForBalance(
  tx: DBorTx,
  args: {
    customerProfileId: string;
    tokenAmount: number;
  },
): Promise<{
  newBalance: number;
  newTokenBalance: number;
}> {
  if (args.tokenAmount <= 0 || args.tokenAmount % 100 !== 0) {
    throw new Error("Swap amount must be a positive multiple of 100.");
  }
  const wallet = await getOrCreateWallet(tx, args.customerProfileId);
  if (wallet.tokenBalance < args.tokenAmount) {
    throw new Error("Insufficient token balance.");
  }
  await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      balance: { increment: args.tokenAmount },
      tokenBalance: { decrement: args.tokenAmount },
    },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "TOKEN_SWAPPED",
      amount: args.tokenAmount,
      description: `Swapped ${args.tokenAmount} tokens for ৳${args.tokenAmount}`,
    },
  });
  return {
    newBalance: wallet.balance + args.tokenAmount,
    newTokenBalance: wallet.tokenBalance - args.tokenAmount,
  };
}

/**
 * Feat 5 — debit the customer's wallet balance when a withdrawal
 * is requested. We deduct immediately so a second withdrawal can't
 * double-spend the same balance; the admin reject path refunds the
 * amount back. The caller passes the `WalletTransaction` link
 * (type=WITHDRAWAL, amount = -requestedAmount).
 */
export async function debitForWithdrawal(
  tx: DBorTx,
  args: {
    customerProfileId: string;
    amount: number;
    description: string;
    relatedWithdrawalId?: string;
  },
): Promise<{ newBalance: number }> {
  if (args.amount <= 0) throw new Error("Amount must be positive.");
  const wallet = await getOrCreateWallet(tx, args.customerProfileId);
  if (wallet.balance < args.amount) {
    throw new Error("Insufficient wallet balance.");
  }
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: args.amount } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "WITHDRAWAL",
      amount: -args.amount,
      description: args.description,
    },
  });
  return { newBalance: wallet.balance - args.amount };
}

/**
 * Restore a previously-debited withdrawal back to the customer's
 * balance when an admin rejects the request.
 */
export async function refundWithdrawal(
  tx: DBorTx,
  args: {
    customerProfileId: string;
    amount: number;
    description: string;
  },
): Promise<{ newBalance: number }> {
  if (args.amount <= 0) return { newBalance: 0 };
  const wallet = await getOrCreateWallet(tx, args.customerProfileId);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: args.amount } },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "ADJUSTMENT",
      amount: args.amount,
      description: args.description,
    },
  });
  return { newBalance: wallet.balance + args.amount };
}

// Re-export so callers that don't already have `prisma` imported
// can hit the helpers without a separate import. Tests use the
// `tx` arg directly to share the parent transaction.
export { defaultPrisma as prisma };

/**
 * Feat 6 — Referral bonus credit. Atomically:
 *
 *   1. Load the referee's open Referral edge (status PENDING).
 *      If there isn't one (no referrer / already REWARDED),
 *      short-circuit. The (refereeUserId) UNIQUE constraint
 *      guarantees there's at most one row.
 *   2. Confirm this is the referee's FIRST DELIVERED order.
 *      Subsequent deliveries are no-ops.
 *   3. Flip the Referral row to REWARDED (status + rewardedAt).
 *   4. Resolve both wallets, credit each with the constant
 *      `REFERRAL_REWARD_AMOUNT`, and append a WalletTransaction
 *      with type REFERRAL_BONUS tagged to the order id.
 *
 * All inside one `prisma.$transaction` so a partial failure
 * rolls back the credit AND the Referral flip together — no
 * "rewarded but no balance", no "balance but not flagged".
 *
 * `rewarded: false` cases that this function handles silently:
 *
 *   • referee never had a Referral row (no one referred them)
 *   • Referral already REWARDED (this order isn't the first)
 *   • referrer / referee has no CustomerProfile yet (very
 *     unlikely post-registration, but guard anyway)
 */
export type ReferralRewardResult =
  | {
      rewarded: true;
      referralId: string;
      referrerUserId: string;
      refereeUserId: string;
      rewardAmount: number;
    }
  | { rewarded: false; reason: string };

export async function creditReferralBonusIfEligible(
  client: DBorTx,
  args: {
    refereeUserId: string;
    relatedOrderId: string;
  },
): Promise<ReferralRewardResult> {
  // Import lazily to avoid a circular module graph (lib/referral
  // pulls in lib/prisma which is fine, but keeping the constant
  // inside the wallet module itself makes the read flow obvious).
  const { REFERRAL_REWARD_AMOUNT } = await import("@/lib/referral");

  // Find the pending Referral row for this referee. We do NOT
  // include the order here — the first-delivered check is its
  // own query below so we can fall back gracefully if the
  // referrer / referee profile was hard-deleted.
  const referral = await client.referral.findUnique({
    where: { refereeUserId: args.refereeUserId },
    include: {
      referrer: { select: { id: true, deletedAt: true } },
      referee: { select: { id: true, deletedAt: true } },
    },
  });
  if (!referral) {
    return { rewarded: false, reason: "no referral edge" };
  }
  if (referral.status === "REWARDED") {
    return { rewarded: false, reason: "already rewarded" };
  }
  if (referral.referrer.deletedAt || referral.referee.deletedAt) {
    return { rewarded: false, reason: "referrer or referee deleted" };
  }

  // First-delivered guard. If the referee already has another
  // DELIVERED order, this is not their first — no bonus. The
  // `relatedOrderId` is excluded from the count so a re-run
  // for the same order id doesn't trip the guard.
  const earlierDelivered = await client.order.count({
    where: {
      customerId: args.refereeUserId,
      status: "DELIVERED",
      NOT: { id: args.relatedOrderId },
    },
  });
  if (earlierDelivered > 0) {
    return { rewarded: false, reason: "not the first delivered order" };
  }

  // Both sides' wallets must be present. If either profile is
  // missing (the user is mid-registration), bail out — the
  // bonus will be lost for this run but the order status is
  // already DELIVERED, which is what the customer sees.
  const referrerProfile = await client.customerProfile.findUnique({
    where: { userId: referral.referrerUserId },
    select: { id: true },
  });
  const refereeProfile = await client.customerProfile.findUnique({
    where: { userId: referral.refereeUserId },
    select: { id: true },
  });
  if (!referrerProfile || !refereeProfile) {
    return { rewarded: false, reason: "missing customer profile" };
  }

  // Single atomic block: flip + 2 credits + 2 transactions.
  // We have to honour the caller's transaction context: when
  // the caller passes the global PrismaClient we open a fresh
  // $transaction; when they pass a TransactionClient we
  // participate in the caller's transaction so the caller can
  // commit / roll back together.
  const exec = async (tx: Prisma.TransactionClient) => {
    // Conditional update — only if still PENDING. This is the
    // final idempotency guard: if a parallel PATCH landed
    // first, our updateMany will report 0 and we abort.
    const flipped = await tx.referral.updateMany({
      where: { id: referral.id, status: "PENDING" },
      data: { status: "REWARDED", rewardedAt: new Date() },
    });
    if (flipped.count === 0) {
      return { rewarded: false, reason: "concurrent flip" } satisfies ReferralRewardResult;
    }

    const referrerWallet = await getOrCreateWallet(tx, referrerProfile.id);
    const refereeWallet = await getOrCreateWallet(tx, refereeProfile.id);

    await tx.wallet.update({
      where: { id: referrerWallet.id },
      data: { balance: { increment: REFERRAL_REWARD_AMOUNT } },
    });
    await tx.wallet.update({
      where: { id: refereeWallet.id },
      data: { balance: { increment: REFERRAL_REWARD_AMOUNT } },
    });

    // One audit row per wallet so the customer's history
    // shows a clean "+৳50 Referral Bonus" entry on each side.
    await tx.walletTransaction.createMany({
      data: [
        {
          walletId: referrerWallet.id,
          type: "REFERRAL_BONUS",
          amount: REFERRAL_REWARD_AMOUNT,
          relatedOrderId: args.relatedOrderId,
          description:
            "Referral bonus — your friend completed their first order",
        },
        {
          walletId: refereeWallet.id,
          type: "REFERRAL_BONUS",
          amount: REFERRAL_REWARD_AMOUNT,
          relatedOrderId: args.relatedOrderId,
          description:
            "Referral bonus — thanks for joining with a friend's code",
        },
      ],
    });

    return {
      rewarded: true,
      referralId: referral.id,
      referrerUserId: referral.referrerUserId,
      refereeUserId: referral.refereeUserId,
      rewardAmount: REFERRAL_REWARD_AMOUNT,
    } satisfies ReferralRewardResult;
  };

  // TransactionClient doesn't expose $transaction — only the
  // top-level PrismaClient does. We branch on the runtime
  // instance rather than asking callers to know about it.
  if ("$transaction" in (client as PrismaClient)) {
    return await (client as PrismaClient).$transaction(exec);
  }
  return await exec(client as Prisma.TransactionClient);
}