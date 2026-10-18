import { NextRequest, NextResponse } from "next/server";
import type { PayoutMethod, PayoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notifyPayoutStatus } from "@/lib/notifications";

/**
 * GET /api/rider/payouts
 *
 * Returns the signed-in rider's payout request history (newest
 * first). Capped at 25 rows so the page renders quickly even for
 * long-tenured riders.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json(
      { payouts: [] as Array<Record<string, unknown>> },
      { status: 200 },
    );
  }

  const rows = await prisma.payout.findMany({
    where: { riderProfileId: profile.id },
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
 * POST /api/rider/payouts
 *
 * Body: { amount, paymentAccountId, note? }
 *
 * Mirrors the partner endpoint exactly — the destination is taken
 * from the rider's saved payment account, never typed inline.
 * The route re-derives the available balance (rider's share of
 * the past 30-day DELIVERED orders, summed from the `riderEarning`
 * snapshot, minus non-FAILED payouts) and the ৳500 minimum so a
 * stale client can't bypass the cap. Rows predating the snapshot
 * column fall back to the legacy 70 % formula.
 */
const MIN_PAYOUT_TAKA = 500;
const VALID_METHODS: PayoutMethod[] = ["BKASH", "NAGAD", "ROCKET", "CARD"];

function isPayoutMethod(value: unknown): value is PayoutMethod {
  return (
    typeof value === "string" &&
    (VALID_METHODS as readonly string[]).includes(value)
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
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

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Rider profile missing" },
      { status: 404 },
    );
  }

  const account = await prisma.riderPaymentAccount.findUnique({
    where: { id: paymentAccountId },
    select: {
      id: true,
      method: true,
      destination: true,
      riderProfileId: true,
    },
  });
  if (!account || account.riderProfileId !== profile.id) {
    return NextResponse.json(
      { error: "Unknown payment account" },
      { status: 404 },
    );
  }
  if (!isPayoutMethod(account.method)) {
    return NextResponse.json(
      { error: `Unknown payout method on account: ${account.method}` },
      { status: 500 },
    );
  }

  // Available balance = sum of `Order.riderEarning` for DELIVERED
  // orders the rider delivered in the last 30 days, minus
  // non-FAILED payouts. Rows predating the snapshot column fall
  // back to the legacy 70% formula, applied to `Order.total`.
  const monthStart = new Date();
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setDate(monthStart.getDate() - 29);

  const [deliveredRows, spentRows] = await Promise.all([
    prisma.order.findMany({
      where: {
        riderId: auth.user.id,
        status: "DELIVERED",
        createdAt: { gte: monthStart },
      },
      select: { total: true, riderEarning: true },
    }),
    prisma.payout.findMany({
      where: {
        riderProfileId: profile.id,
        status: { not: "FAILED" as PayoutStatus },
      },
      select: { amount: true },
    }),
  ]);
  const deliveredShare = deliveredRows.reduce((sum, r) => {
    if (
      typeof r.riderEarning === "number" &&
      Number.isFinite(r.riderEarning)
    ) {
      return sum + r.riderEarning;
    }
    return sum + Math.round((r.total ?? 0) * 0.7);
  }, 0);
  const spent = spentRows.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, Math.floor(deliveredShare - spent));

  if (balance < MIN_PAYOUT_TAKA) {
    return NextResponse.json(
      {
        error: `You need at least ৳${MIN_PAYOUT_TAKA} balance to request a payout.`,
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
        riderProfileId: profile.id,
        restaurantId: null,
        partnerPaymentAccountId: null,
        riderPaymentAccountId: account.id,
        amount: Math.round(amount),
        method: account.method,
        destination: account.destination,
        note: normalisedNote,
        status: "PENDING",
      },
    });

    // Bell notification for the rider — gated on the
    // `notifyPayout` preference. The "Payout request submitted"
    // copy gives the rider confirmation that their withdrawal
    // is in the queue; admins later flip the status via
    // PATCH /api/admin/payouts/[id] which fires another bell
    // row (also gated on `notifyPayout`).
    const fullProfile = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { notifyPayout: true },
    });
    if (fullProfile?.notifyPayout !== false) {
      await notifyPayoutStatus(auth.user.id, {
        id: created.id,
        status: created.status,
        amount: created.amount,
      });
    }

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
    console.error("rider/payouts POST failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create payout" },
      { status: 500 },
    );
  }
}
