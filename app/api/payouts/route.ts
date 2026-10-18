import { NextRequest, NextResponse } from "next/server";
import type { PayoutMethod, PayoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/payouts (partner-only)
 *
 * Returns the same payout history the partner's earnings page
 * shows. Capped at 25 rows so a long-time partner can't pull
 * thousands of rows on every render.
 */

const VALID_METHODS: PayoutMethod[] = ["BKASH", "NAGAD", "ROCKET", "CARD"];

function isPayoutMethod(value: unknown): value is PayoutMethod {
  return (
    typeof value === "string" &&
    (VALID_METHODS as readonly string[]).includes(value)
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });
  if (!restaurant) {
    return new NextResponse(null, { status: 204 });
  }

  const rows = await prisma.payout.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json(
    {
      payouts: rows.map((p) => ({
        id: p.id,
        date: p.createdAt.toISOString(),
        amount: p.amount,
        method: p.method,
        destination: p.destination,
        note: p.note,
        status: p.status,
      })),
    },
    { status: 200 },
  );
}

/**
 * POST /api/payouts (partner-only)
 *
 * Creates a payout request against the partner's available balance.
 *
 * Body (JSON):
 *   {
 *     amount:          number,        // 1 - balance
 *     paymentAccountId string,        // saved PartnerPaymentAccount
 *     note?:           string,        // optional, <= 200 chars
 *   }
 *
 * The saved payment account is the source of truth for `method` and
 * `destination` — we never accept those inline (that was the
 * pre-restructure behaviour). The route re-derives the balance +
 * minimum inside the request so a stale client can't bypass the cap.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  const { amount, paymentAccountId, note } = body as Record<string, unknown>;

  // ---- validation --------------------------------------------------
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 1
  ) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 },
    );
  }
  if (typeof paymentAccountId !== "string" || paymentAccountId.length < 1) {
    return NextResponse.json(
      {
        error:
          "paymentAccountId is required. Pick one of your saved payout accounts.",
      },
      { status: 400 },
    );
  }
  let normalisedNote: string | null = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== "string" || note.length > 200) {
      return NextResponse.json(
        { error: "note must be a string up to 200 characters" },
        { status: 400 },
      );
    }
    normalisedNote = note.trim() || null;
  }

  // ---- locate the partner's restaurant ------------------------------
  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: "Create a restaurant before requesting a payout" },
      { status: 404 },
    );
  }

  // ---- verify the saved account belongs to this partner -------------
  const account = await prisma.partnerPaymentAccount.findUnique({
    where: { id: paymentAccountId },
    select: {
      id: true,
      method: true,
      destination: true,
      accountHolder: true,
      label: true,
      partnerProfileId: true,
    },
  });
  if (!account) {
    return NextResponse.json(
      { error: "Unknown payment account" },
      { status: 404 },
    );
  }
  const profile = await prisma.partnerProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  });
  if (!profile || account.partnerProfileId !== profile.id) {
    return NextResponse.json(
      { error: "Payment account does not belong to this partner" },
      { status: 403 },
    );
  }
  if (!isPayoutMethod(account.method)) {
    // Defensive — should never happen since the column is typed as
    // PayoutMethod, but a future migration could leak an unknown
    // method.
    return NextResponse.json(
      { error: `Unknown payout method on account: ${account.method}` },
      { status: 500 },
    );
  }

  // ---- re-compute balance + minimum inside the request ------------
  const MIN_PAYOUT_TAKA = 500;

  const [deliveredSum, spentRows] = await Promise.all([
    prisma.order.aggregate({
      where: {
        restaurantId: restaurant.id,
        status: "DELIVERED",
      },
      _sum: { total: true },
    }),
    prisma.payout.findMany({
      where: {
        restaurantId: restaurant.id,
        status: { not: "FAILED" as PayoutStatus },
      },
      select: { amount: true },
    }),
  ]);
  const spent = spentRows.reduce((s, p) => s + p.amount, 0);
  const balance = (deliveredSum._sum.total ?? 0) - spent;

  if (balance < MIN_PAYOUT_TAKA) {
    return NextResponse.json(
      {
        error: `সর্বনিম্ন ${MIN_PAYOUT_TAKA} টাকা balance দরকার payout request করতে`,
      },
      { status: 400 },
    );
  }
  if (amount > balance) {
    return NextResponse.json(
      { error: `Amount exceeds available balance (${balance})` },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.payout.create({
      data: {
        restaurantId: restaurant.id,
        riderProfileId: null,
        partnerPaymentAccountId: account.id,
        riderPaymentAccountId: null,
        amount: Math.round(amount),
        method: account.method,
        destination: account.destination,
        note: normalisedNote,
        status: "PENDING",
      },
    });

    return NextResponse.json(
      {
        payout: {
          id: created.id,
          amount: created.amount,
          method: created.method,
          destination: created.destination,
          note: created.note,
          status: created.status,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("payouts POST failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create payout" },
      { status: 500 },
    );
  }
}
