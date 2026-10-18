// app/api/referral/route.ts
//
// Feat 6 — GET /api/referral
//
// Customer-facing "Refer & Earn" data:
//   • the customer's own referralCode (regenerated lazily if
//     somehow missing — defensive for old rows that pre-date
//     the column)
//   • counts of referrals they made, split PENDING vs REWARDED
//   • the base URL the customer should share so links round-trip
//     back to /register?ref=…
//
// Admin / Partner / Rider accounts get a 403 — the feature is
// customer-only, mirroring the registration route.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { generateUniqueReferralCode } from "@/lib/referral";

function publicBaseUrl(req: NextRequest): string {
  // Prefer the configured PUBLIC_BASE_URL so we don't echo a
  // localhost:3000 address back to a real customer. Fall back
  // to the request's origin so dev / preview environments
  // still produce a copyable link.
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Referral program is customer-only" },
      { status: 403 },
    );
  }

  // Make sure the customer has a code even if the backfill
  // missed them (e.g. a customer created post-deploy by an
  // out-of-band script). The unique check + retry inside
  // `generateUniqueReferralCode` keeps this safe to call
  // concurrently.
  let referralCode = await prisma.user
    .findUnique({
      where: { id: auth.user.id },
      select: { referralCode: true },
    })
    .then((row) => row?.referralCode ?? null);

  if (!referralCode) {
    referralCode = await generateUniqueReferralCode(prisma);
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { referralCode },
    });
  }

  // Single grouped query for the counts. `groupBy` returns one
  // row per status, so we coalesce into a {pending, rewarded}
  // map on the client.
  const grouped = await prisma.referral.groupBy({
    by: ["status"],
    where: { referrerUserId: auth.user.id },
    _count: { _all: true },
  });

  let pending = 0;
  let rewarded = 0;
  for (const row of grouped) {
    const count = row._count._all;
    if (row.status === "PENDING") pending += count;
    else if (row.status === "REWARDED") rewarded += count;
  }

  const base = publicBaseUrl(req);
  const shareUrl = `${base}/register?ref=${encodeURIComponent(referralCode)}`;

  return NextResponse.json({
    referralCode,
    shareUrl,
    pending,
    rewarded,
  });
}