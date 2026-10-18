// GET /api/wallet
//
// Customer-only. Returns the caller's wallet (auto-creates if missing
// — first GET after signup seeds an empty Wallet row so the UI can
// render an empty state cleanly) plus the most recent 50
// transactions, newest first.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { getOrCreateWallet } from "@/lib/wallet";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Only customers have a KhaiDai Wallet." },
      { status: 403 },
    );
  }

  // Look up the customer's profile id (the Wallet is unique-per-
  // profile, not per-user, so we go through CustomerProfile).
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

  // Run in a transaction so the wallet-create + transaction-list
  // read are consistent.
  const result = await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, profile.id);
    const txs = await tx.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        relatedOrderId: true,
        createdAt: true,
      },
    });
    return { wallet, txs };
  });

  return NextResponse.json(
    {
      wallet: {
        balance: result.wallet.balance,
        tokenBalance: result.wallet.tokenBalance,
      },
      transactions: result.txs.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        relatedOrderId: t.relatedOrderId,
        createdAt: t.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}