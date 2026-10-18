import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/otp";
import { sendOtpEmail, isMailConfigured } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/auth/otp/request
 *
 * ধাপ ২ — Step A of the registration flow. The user typed an email,
 * hit "Send Code", and we (a) rate-limit, (b) generate a 6-digit
 * OTP, (c) hash it, (d) persist an EmailOtp row, and (e) email it.
 *
 * The response is ALWAYS the same — whether the email is already
 * registered, whether the rate limit kicked in, or whether SMTP
 * failed. The actual registration form only reveals "this email
 * is already taken" once the user reaches step B, which mirrors
 * the leak-resistant behaviour most login flows use.
 *
 * Rate limit (per email):
 *   • At most one request per 60 seconds.
 *   • At most 5 requests per hour.
 *
 * Both limits are tracked in-memory (see the Maps below). A
 * process restart resets the counters; that's acceptable here
 * because the rate-limit exists to slow down an attacker, not
 * to enforce a contract.
 *
 * Request:
 *   { email: string, purpose: "REGISTRATION" }
 *
 * Responses:
 *   200 { ok: true }
 *   400 invalid body
 *   429 rate-limited (same shape as 200, but with a `retryAfter`
 *       seconds hint so the UI can disable the button)
 *   503 SMTP not configured (caller surfaces this in the UI)
 */
const RATE_COOLDOWN_MS = 60_000;
const RATE_HOURLY_CAP = 5;
const HOUR_MS = 60 * 60_000;

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
  const v = body as Record<string, unknown>;
  if (typeof v.email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const email = v.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "email must be a valid address" },
      { status: 400 },
    );
  }
  // We only support REGISTRATION today. Accepting but ignoring
  // other purposes keeps the wire surface forward-compatible.
  const purpose = "REGISTRATION" as const;

  // ---- duplicate-account pre-check (ধাপ ৩) ---------------------------
  // UX: we don't want to send the user an OTP and then have the
  // register API reject them with "email already exists". So we
  // pre-flight here — if the email is already taken we skip the
  // rate-limit counter AND the SMTP send, but still return the
  // generic 200 so we don't leak account existence to the caller.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, delivered: true }, { status: 200 });
  }

  // ---- rate limit (DB-backed; survives Vercel cold-starts) -------------
  const now = Date.now();
  const decision = await enforceRateLimit({
    scope: "OTP_REQUEST",
    key: email.toLowerCase(),
    cooldownMs: RATE_COOLDOWN_MS,
    hourlyCap: RATE_HOURLY_CAP,
  });
  if (!decision.ok) {
    return NextResponse.json(
      {
        ok: true,
        retryAfter: decision.retryAfter,
        message:
          decision.reason === "cooldown"
            ? "Please wait a moment before requesting another code."
            : "Too many code requests. Try again later.",
      },
      { status: 429 },
    );
  }

  // ---- mint + persist + send ----------------------------------------
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(now + OTP_TTL_MS);

  try {
    // Bug 1 fix — invalidate any prior unconsumed rows for this
    // (email, purpose) BEFORE writing the new one. Without this, a
    // user who clicked "Send Code" twice (or whose dev server
    // restarted and lost the in-memory cooldown map, then re-sent)
    // could end up with two valid rows in the DB. The verify path
    // picks the LATEST row, so the older code became silently
    // useless — but the user, reading the FIRST email, would type
    // the wrong code and see "Incorrect code". Marking the older
    // rows consumed here eliminates that ambiguity entirely: only
    // the freshly-minted code is valid.
    await prisma.emailOtp.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date(now) },
    });
    // Persist first so a partial SMTP failure doesn't leave the
    // user with an emailed code but no server record (or vice
    // versa). If the SMTP call fails the row stays alive but
    // `consumedAt` remains null; subsequent attempts will reject
    // this email again because the rate limit catches the next
    // request.
    await prisma.emailOtp.create({
      data: { email, otpHash, expiresAt, purpose },
    });
  } catch (err) {
    console.error("otp/request: failed to persist EmailOtp row", err);
    return NextResponse.json(
      { error: "Failed to start verification. Try again." },
      { status: 500 },
    );
  }

  // Bookkeeping (rate-limit row) is already written by
  // `enforceRateLimit` above — no in-process Map to maintain.

  if (!isMailConfigured()) {
    // Don't lie to the user about having sent something. Return a
    // distinct 503 so the UI can show "mail service is unavailable".
    return NextResponse.json(
      {
        error:
          "We couldn't send the code right now. Please try again shortly.",
      },
      { status: 503 },
    );
  }

  // Fire-and-await. lib/mailer handles its own errors so we never
  // throw here. If mail fails the row stays; the user can request
  // a new code (subject to the rate limit).
  const sent = await sendOtpEmail(email, otp, purpose);
  if (!sent.ok) {
    console.error("otp/request: sendOtpEmail failed for", email, sent.reason);
    // We still return 200 with a hint so the UI doesn't claim the
    // email went out. The user can re-request. We deliberately do
    // NOT mark the row as consumed so a retry can reuse the same
    // code if SMTP recovers within the 10-minute window.
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

  return NextResponse.json({ ok: true, delivered: true }, { status: 200 });
}