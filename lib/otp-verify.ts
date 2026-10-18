// lib/otp-verify.ts
//
// Shared verify-OTP helper used by all three registration routes
// AND the password-reset confirm route. The caller passes the
// EmailOtp `purpose` so a code minted for one flow (e.g.
// REGISTRATION) can never be used to satisfy another (e.g.
// PASSWORD_RESET) — the two buckets are otherwise identical
// (SHA-256 hash, 10-min TTL, 5-attempt cap).
//
// Each route calls `verifyAndConsumeOtp(email, otp, purpose)`
// BEFORE creating any User row (registration) or before updating
// the password (reset). If it returns `{ ok: false, status, error }`
// the route passes the error straight to the client.

import "dotenv/config";
import type { EmailOtpPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashOtp, MAX_ATTEMPTS, safeEqualHex } from "@/lib/otp";

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Verify the supplied 6-digit code against the most recent
 * unconsumed, unexpired EmailOtp row for `purpose`.
 *
 * Side effects on success:
 *   - Sets `consumedAt = now` so the code can't be re-used.
 *
 * Side effects on failure (any reason):
 *   - Bumps `attempts` by 1. The caller doesn't need to
 *     increment themselves — the verification is atomic from
 *     the route's perspective.
 *
 * Returns:
 *   - 200 / { ok: true } on success
 *   - 400 / "Code expired" if the latest row is past its TTL
 *   - 400 / "Incorrect code" if the SHA-256 doesn't match
 *   - 400 / "Too many attempts, request a new code" once
 *     `attempts` reaches MAX_ATTEMPTS
 *   - 400 / "No active code. Request a code first." if there's
 *     nothing to verify against for this (email, purpose) pair
 *
 * কাজ ২ — the `purpose` parameter is required. The function
 * refuses to fall back to a default bucket; callers must declare
 * which flow they're verifying for. This makes it impossible to
 * silently accept a registration code at the password-reset
 * endpoint (or vice versa) when the EmailOtp table contains rows
 * for multiple purposes for the same email.
 */
export async function verifyAndConsumeOtp(
  email: string,
  otp: string,
  purpose: EmailOtpPurpose,
): Promise<VerifyOtpResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(otp)) {
    return { ok: false, status: 400, error: "Incorrect code" };
  }

  // Find the latest unconsumed row SCOPED TO THIS PURPOSE. We sort
  // by createdAt desc and limit to 1 — older rows are dead weight.
  // Without the purpose filter, a stale registration code would
  // be accepted at the password-reset endpoint (and vice versa).
  const row = await prisma.emailOtp.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    return {
      ok: false,
      status: 400,
      error: "No active code. Request a code first.",
    };
  }

  // Burnt? attempts >= MAX_ATTEMPTS means the user already burned
  // this row and we should refuse before comparing hashes again.
  if (row.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 400,
      error: "Too many attempts, request a new code",
    };
  }

  // Expired? Same as above — we don't compare, we tell the user
  // to request a new code.
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "Code expired" };
  }

  // Hash + constant-time compare.
  const otpHash = hashOtp(otp);
  if (!safeEqualHex(otpHash, row.otpHash)) {
    // Bump the attempts counter atomically. We don't consume the
    // row — a correct second guess (within 5 attempts + TTL) still
    // works. This matches the "5 wrong tries and you're out"
    // promise the email body makes.
    await prisma.emailOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, status: 400, error: "Incorrect code" };
  }

  // Success. Mark consumed.
  await prisma.emailOtp.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}
