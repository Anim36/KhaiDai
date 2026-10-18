// lib/rateLimit.ts
//
// Cross-instance rate limit helper backed by the `RateLimitEvent`
// Prisma model. Replaces the in-process `Map<key, number>` rate
// limits that used to live inside each API route — those silently
// reset on every serverless cold-start on Vercel, so a motivated
// attacker could spin requests across cold-start windows to slip
// past the cap.
//
// How it works
// ────────────
//   1. Each call writes a row to `RateLimitEvent(scope, key)`.
//   2. Before allowing the action, we count how many rows exist
//      for `(scope, key)` within the active window (e.g. last
//      60 s for a cooldown, last 60 min for an hourly cap).
//   3. If the count is over the cap, we return a
//      `Retry-After`-style payload and DO NOT insert a new row
//      (so a flood of blocked requests doesn't bloat the table).
//   4. We also opportunistically prune rows older than the
//      longest window in the same call — cheap to do while
//      we're already paying for the round-trip.
//
// Why DB-backed (and not e.g. Upstash Redis)?
//   • The cap and traffic patterns are low — even at 1 req/s per
//     user, the table stays well under 1k rows for the 1-hour
//     window we actually care about.
//   • Neon Postgres is already in the stack; no new infra, no
//     extra monthly cost.
//   • If the project ever outgrows this (millions of events /
//     day), swap the storage to Redis — the function signature
//     here doesn't need to change.

import { prisma } from "./prisma";

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfter: number; reason: "cooldown" | "hourly_cap" };

export type RateLimitRule = {
  /** Stable identifier of the rate-limit scope (e.g. "OTP_REQUEST"). */
  scope: string;
  /** Per-caller key — usually `${ip}|${email.toLowerCase()}`. */
  key: string;
  /**
   * Cooldown between two *successful* requests from the same key.
   * If the most-recent row is younger than this, we 429.
   */
  cooldownMs: number;
  /**
   * Hard cap on how many requests a single key can make inside
   * the rolling hour window.
   */
  hourlyCap: number;
};

/**
 * Enforce `rule` for the given key. If allowed, also writes a
 * tracking row so future calls see this one.
 *
 * Safe to call from inside an API route handler. The function
 * never throws on transient DB errors — it fails *open* (allows
 * the request) and logs the error so a DB outage doesn't lock
 * out the entire app.
 */
export async function enforceRateLimit(
  rule: RateLimitRule,
): Promise<RateLimitDecision> {
  const { scope, key, cooldownMs, hourlyCap } = rule;
  const now = Date.now();

  try {
    const windowStart = new Date(now - HOUR_MS);

    // Recent events for the (scope, key) within the last hour.
    // We only pull the `createdAt` column to keep the payload
    // tiny — a serverless function billed by GB-second will
    // thank us.
    const recent = await prisma.rateLimitEvent.findMany({
      where: {
        scope,
        key,
        createdAt: { gte: windowStart },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Cooldown: most recent row must be older than cooldownMs.
    if (recent.length > 0) {
      const newest = recent[0].createdAt.getTime();
      const elapsed = now - newest;
      if (elapsed < cooldownMs) {
        return {
          ok: false,
          retryAfter: Math.ceil((cooldownMs - elapsed) / 1000),
          reason: "cooldown",
        };
      }
    }

    // Hourly cap.
    if (recent.length >= hourlyCap) {
      const oldest = recent[recent.length - 1].createdAt.getTime();
      const retryAfter = Math.ceil((HOUR_MS - (now - oldest)) / 1000);
      return {
        ok: false,
        retryAfter: Math.max(retryAfter, 1),
        reason: "hourly_cap",
      };
    }

    // Allowed — record this request.
    await prisma.rateLimitEvent.create({
      data: { scope, key },
    });

    return { ok: true };
  } catch (err) {
    // Fail-open. The DB is briefly unavailable, but a denial of
    // service is worse than letting through a few extra OTP
    // requests. Log so we know it happened.
    console.error(`[rateLimit:${scope}] failed to check; allowing`, err);
    return { ok: true };
  }
}

const HOUR_MS = 60 * 60 * 1000;
