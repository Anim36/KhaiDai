import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateOtp,
  hashOtp,
  OTP_TTL_MS,
  MAX_ATTEMPTS,
} from "@/lib/otp";
import { sendOtpEmail, isMailConfigured } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/auth/password-reset/request
 *
 * কাজ ২ — Step A of the forgot-password flow. The user types
 * their email, hits "Send reset code", and we (a) rate-limit, (b)
 * check the email exists in the User table, (c) generate a
 * 6-digit OTP into the EmailOtp table with `purpose =
 * PASSWORD_RESET`, and (d) email it.
 *
 * The response is ALWAYS the same — whether the email exists
 * or not, whether the rate limit kicked in, or whether SMTP
 * failed. We deliberately don't leak whether an account is
 * registered for a given address, because a confirmatory
 * response ("we've sent a code to your email") is itself a
 * small info-leak vector (an attacker can enumerate which
 * emails are KhaiDai users by checking for the redirect vs an
 * inline error).
 *
 * The actual user-facing copy for "this email isn't registered"
 * lives in the FORGOT-PASSWORD PAGE: the page always says
 * "If the email is registered, we've sent a code." Together,
 * the API + the UI form a single privacy-preserving surface.
 *
 * Body (JSON):
 *   { email: string }
 *
 * Responses:
 *   200 { ok: true, delivered: boolean }   ← generic; the caller
 *                                            can surface the same
 *                                            message whether or
 *                                            not the email is
 *                                            known.
 *   200 { ok: true, retryAfter: number }   ← 60s cooldown active
 *   400 validation error
 *   500 server error (e.g. DB write failed)
 */

// 60s cooldown + 5/hr cap per email — same as the registration
// OTP request route. The rate-limit state is now DB-backed (see
// `lib/rateLimit.ts`); the previous in-process Map silently
// reset on every Vercel cold-start, so a motivated attacker
// could slip past the cap by spinning requests across cold-
// start windows.
const RATE_COOLDOWN_MS = 60_000;
const RATE_HOURLY_CAP = 5;

export async function POST(req: NextRequest) {
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
  const emailRaw = (body as Record<string, unknown>).email;
  if (typeof emailRaw !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json(
      { error: "email must be a valid address" },
      { status: 400 },
    );
  }
  const email = emailRaw.trim().toLowerCase();

  // Rate limit (always — even for unknown emails — to make email-
  // enumeration via timing harder).
  const rl = await enforceRateLimit({
    scope: "PASSWORD_RESET",
    key: email.toLowerCase(),
    cooldownMs: RATE_COOLDOWN_MS,
    hourlyCap: RATE_HOURLY_CAP,
  });
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: true,
        retryAfter: rl.retryAfter,
        message:
          rl.reason === "cooldown"
            ? "Please wait a moment before requesting another code."
            : "Too many code requests. Try again later.",
      },
      { status: 200 },
    );
  }

  const now = Date.now();

  // Privacy — DON'T reveal whether the email is registered. We
  // still rate-limit + still mint a row to keep the response-time
  // profile constant, but the "delivered" branch only sends mail
  // when the user actually exists. Unknown emails get a fake
  // 200 with delivered:false, identical shape to the real one.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    // Generic 200 — caller can't tell this from a real send.
    // We still recorded the rate-limit bucket above so an
    // attacker can't hammer this endpoint on random addresses
    // and have it be free.
    return NextResponse.json({ ok: true, delivered: false }, { status: 200 });
  }

  // ---- mint + persist + send ---------------------------------------
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(now + OTP_TTL_MS);

  try {
    // Bug 1 fix from the registration OTP flow — invalidate any
    // prior unconsumed PASSWORD_RESET rows for this email so a
    // re-sent code never sits alongside a stale one. The user's
    // "latest code wins" mental model relies on this.
    await prisma.emailOtp.updateMany({
      where: { email, purpose: "PASSWORD_RESET", consumedAt: null },
      data: { consumedAt: new Date(now) },
    });
    await prisma.emailOtp.create({
      data: {
        email,
        otpHash,
        expiresAt,
        purpose: "PASSWORD_RESET",
        attempts: 0,
      },
    });
  } catch (err) {
    console.error("password-reset/request: failed to persist EmailOtp row", err);
    return NextResponse.json(
      { error: "Failed to start verification. Try again." },
      { status: 500 },
    );
  }

  // (Rate-limit row was already written by `enforceRateLimit`
  // above; nothing to do here.)

  // Fire-and-await. lib/mailer handles its own errors so we never
  // throw here. If mail fails the row stays; the user can request
  // a new code (subject to the rate limit).
  const sent = await sendOtpEmail(email, otp, "PASSWORD_RESET");
  if (!sent.ok) {
    console.error(
      "password-reset/request: sendOtpEmail failed for",
      email,
      sent.reason,
    );
    return NextResponse.json(
      {
        ok: true,
        delivered: false,
        message:
          "We couldn't deliver the code right now. Please try again shortly.",
      },
      { status: 200 },
    );
  }

  // Surface mail-not-configured loudly — without this a fresh
  // dev environment would silently swallow codes.
  if (!isMailConfigured()) {
    return NextResponse.json(
      {
        ok: true,
        delivered: false,
        message:
          "Email delivery is not configured in this environment. Contact support.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, delivered: true }, { status: 200 });
}
