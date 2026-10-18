// POST /api/wallet/swap-tokens
//
// Feat 4 — customer-side "Swap Tokens" action. Moves
// `tokenAmount` tokens out of `tokenBalance` and credits the
// equivalent amount to `balance` (1 token = ৳1). Caller-supplied
// `tokenAmount` is server-validated:
//   • positive
//   • multiple of 100
//   • ≤ wallet.tokenBalance
//
// Body: { tokenAmount: number }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { getOrCreateWallet, swapTokensForBalance } from "@/lib/wallet";

export async function POST(req: NextRequest) {
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
  const tokenAmount = patch.tokenAmount;
  if (
    typeof tokenAmount !== "number" ||
    !Number.isFinite(tokenAmount) ||
    tokenAmount <= 0 ||
    tokenAmount % 100 !== 0
  ) {
    return NextResponse.json(
      {
        error:
          "tokenAmount must be a positive integer that is a multiple of 100.",
      },
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
    const out2 = await prisma.$transaction(async (tx) => {
      // Get-or-create + balance sanity (server-trusted) lives
      // inside swapTokensForBalance.
      return swapTokensForBalance(tx, {
        customerProfileId: profile.id,
        tokenAmount,
      });
    });
    // Re-read the wallet so the response shape matches `GET /api/wallet`.
    const w = await getOrCreateWallet(prisma, profile.id);
    void w; // not needed; out2 is enough
    return NextResponse.json(
      {
        wallet: {
          balance: out2.newBalance,
          tokenBalance: out2.newTokenBalance,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to swap tokens.",
      },
      { status: 400 },
    );
  }
}