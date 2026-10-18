// app/api/riders/leaderboard/route.ts
//
// Feat 2 — Rider Leaderboard / Incentive.
//
//   GET /api/riders/leaderboard?period=week
//
// Rider-only. Returns the weekly delivery leaderboard:
//
//   • `ranking[]` — top-10 riders ordered by DELIVERED-order
//     count in the current Asia/Dhaka week (Sun 00:00 → now).
//     Each entry has:
//        rank (1-based), riderId, deliveries, earnings,
//        maskedName (privacy — first-name + last initial, e.g.
//        "Rakib H.").
//   • `selfRank` — the calling rider's own row, even if they're
//     not in the top-10. `null` when the caller hasn't delivered
//     this week.
//   • `period` — descriptive copy ("This Week — Sun … Sat").
//   • `threshold` — the weekly delivery count that unlocks the
//     gamification badge (currently 20).
//
// Time-zone — all bucketing uses Asia/Dhaka (UTC+06:00, no
// DST) because the rider workforce is Bangladesh-based and a
// delivery at 23:50 Saturday Dhaka time should count toward
// "this week", not the next. The conversion is done in JS
// via a `Date.UTC(...) + 6h` shift because Postgres / Prisma
// doesn't carry a tz-aware column for this query.

import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const TOP_N = 10;
const WEEKLY_BONUS_THRESHOLD = 20;

/**
 * Dhaka is UTC+06:00 with no DST. We treat "Sunday 00:00
 * local" as the start of the week (Dhaka work week is
 * Sun-Thu). All offsets are minute-stable so a delivery at
 * 23:59 Sat Dhaka = 17:59 Sat UTC, which still falls BEFORE
 * the next Sun 00:00 Dhaka (= next Sat 18:00 UTC).
 */
function dhakaShiftMinutes(): number {
  return 6 * 60;
}

/**
 * Compute the UTC instant of the most recent Sun 00:00 in
 * Asia/Dhaka. The returned Date is in UTC; passing it to a
 * `gte` Prisma filter against `createdAt` returns all rows
 * from "Sunday 00:00 Dhaka" onward.
 */
function startOfWeekDhakaUtc(now: Date = new Date()): Date {
  const shiftMs = dhakaShiftMinutes() * 60 * 1000;
  // Localise to Dhaka wall time.
  const local = new Date(now.getTime() + shiftMs);
  // 0=Sunday, 1=Monday, …, 6=Saturday in JS getDay().
  const dayOfWeek = local.getUTCDay();
  const daysSinceSunday = dayOfWeek; // 0 if today is Sunday
  const localStartOfDay = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0, 0),
  );
  localStartOfDay.setUTCDate(localStartOfDay.getUTCDate() - daysSinceSunday);
  return new Date(localStartOfDay.getTime() - shiftMs);
}

function formatDhakaDateLabel(d: Date): string {
  // d is in UTC but represents Sun 00:00 Dhaka.
  const shiftMs = dhakaShiftMinutes() * 60 * 1000;
  const local = new Date(d.getTime() + shiftMs);
  return local.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export type LeaderboardResponse = {
  period: { label: string; weekStart: string; weekEnd: string };
  threshold: number;
  thresholdUnlocked: boolean;
  ranking: Array<{
    rank: number;
    riderId: string;
    maskedName: string;
    deliveries: number;
    earnings: number;
  }>;
  selfRank:
    | {
        rank: number;
        riderId: string;
        maskedName: string;
        deliveries: number;
        earnings: number;
      }
    | null;
  totalRidersRanked: number;
};

/**
 * Privacy — "Rakib H." style. We split on whitespace, keep
 * the first word verbatim and initial-uppercase the rest.
 * Single-word names just return the original. We do NOT
 * expose the raw name to the page; the page renders
 * `maskedName` only.
 */
function maskName(full: string | null | undefined): string {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return "Rider";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const rest = parts.slice(1).map((p) => `${p[0].toUpperCase()}.`).join(" ");
  return `${first} ${rest}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "week";
  if (period !== "week") {
    return NextResponse.json(
      { error: "Unsupported period (only 'week' is supported)" },
      { status: 400 },
    );
  }

  const weekStart = startOfWeekDhakaUtc(new Date());

  // Single groupBy over the Order table for DELIVERED orders
  // since `weekStart`. The (riderId, status, createdAt)
  // index covers this — `status` first to prune the rowset
  // before the index range scan on `createdAt`.
  const grouped = await prisma.order.groupBy({
    by: ["riderId"],
    where: {
      status: OrderStatus.DELIVERED,
      riderId: { not: null },
      createdAt: { gte: weekStart },
    },
    _count: { _all: true },
    _sum: { riderEarning: true },
  });

  // Load the riders' display names. We restrict to active,
  // non-deleted RIDER accounts so suspended / banned users
  // don't appear on the leaderboard.
  const riderIds = grouped
    .map((g) => g.riderId)
    .filter((id): id is string => typeof id === "string");
  const riders = riderIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: riderIds },
          role: "RIDER",
          deletedAt: null,
          isSuspended: false,
        },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(riders.map((r) => [r.id, r.name]));

  // Build the full leaderboard sorted by deliveries desc,
  // ties broken by earnings desc, then by name (stable).
  const leaderboard = grouped
    .filter((g): g is typeof g & { riderId: string } =>
      typeof g.riderId === "string" && nameById.has(g.riderId),
    )
    .map((g) => ({
      riderId: g.riderId,
      maskedName: maskName(nameById.get(g.riderId) ?? null),
      deliveries: g._count._all,
      earnings: g._sum.riderEarning ?? 0,
    }))
    .sort((a, b) => {
      if (b.deliveries !== a.deliveries) return b.deliveries - a.deliveries;
      if (b.earnings !== a.earnings) return b.earnings - a.earnings;
      return a.maskedName.localeCompare(b.maskedName);
    });

  const totalRidersRanked = leaderboard.length;

  // Self rank — the calling rider's own row regardless of
  // whether they're in the top-10. The slice + index lookup
  // both happen on the same array so the rank numbers stay
  // contiguous.
  const myIdx = leaderboard.findIndex((r) => r.riderId === auth.user.id);
  const selfRank =
    myIdx === -1
      ? null
      : {
          rank: myIdx + 1,
          riderId: leaderboard[myIdx].riderId,
          maskedName: leaderboard[myIdx].maskedName,
          deliveries: leaderboard[myIdx].deliveries,
          earnings: leaderboard[myIdx].earnings,
        };

  const top = leaderboard.slice(0, TOP_N).map((r, i) => ({
    rank: i + 1,
    riderId: r.riderId,
    maskedName: r.maskedName,
    deliveries: r.deliveries,
    earnings: r.earnings,
  }));

  // The threshold badge: the rider crosses 20 deliveries this
  // week they unlock the gamification badge. The `rank` is
  // intentionally not part of the unlock — anyone, anywhere
  // on the leaderboard, gets it.
  const myDeliveries = selfRank?.deliveries ?? 0;
  const thresholdUnlocked = myDeliveries >= WEEKLY_BONUS_THRESHOLD;

  const body: LeaderboardResponse = {
    period: {
      label: "This Week",
      weekStart: weekStart.toISOString(),
      weekEnd: new Date().toISOString(),
    },
    threshold: WEEKLY_BONUS_THRESHOLD,
    thresholdUnlocked,
    ranking: top,
    selfRank,
    totalRidersRanked,
  };
  // Best-effort hint for the page header — the period label
  // we computed uses the static "This Week". The weekStart
  // string is the actual Sun 00:00 Dhaka instant so the UI
  // can render "Sun 28 Sep → Sat 04 Oct" if it wants.
  body.period.label = `This Week — ${formatDhakaDateLabel(weekStart)}`;

  return NextResponse.json(body);
}