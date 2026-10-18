import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { verifyAndConsumeOtp } from "@/lib/otp-verify";
import { sendPasswordChangedNotice } from "@/lib/mailer";

/**
 * POST /api/auth/password-reset/confirm
 *
 * কাজ ২ — Step B of the forgot-password flow. The user typed
 * their email + 6-digit code + new password (+ confirm
 * password). We verify the OTP scoped to PASSWORD_RESET, hash
 * the new password with bcrypt (12 rounds, matching the
 * registration route), update `User.password`, and send a
 * "your password was just changed" notice so a phishing-
 * conscious user can spot unauthorised resets.
 *
 * Stateless JWT means there's no server-side session row to
 * invalidate. The defence-in-depth path is the security
 * notification email.
 *
 * Body (JSON):
 *   {
 *     email:       string,
 *     otp:         string,         // 6 digits
 *     newPassword: string,         // 8+ chars (we re-validate here
 *                                 //   rather than trusting the
 *                                 //   registration validator's
 *                                 //   shape — they're identical but
 *                                 //   keeping the rule in one
 *                                 //   place is clearer)
 *   }
 *
 * Responses:
 *   200 { ok: true, role: "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN" }
 *   400 validation error / OTP failure
 *   404 user not found (shouldn't normally happen — the request
 *       route only sends mail when a user exists, so reaching
 *       here for an unknown email implies someone is replaying)
 *   500 server error
 */
const PASSWORD_MIN_LENGTH = 8;

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
  const patch = body as Record<string, unknown>;
  const emailRaw = patch.email;
  const otpRaw = patch.otp;
  const newPasswordRaw = patch.newPassword;

  if (typeof emailRaw !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json(
      { error: "email must be a valid address" },
      { status: 400 },
    );
  }
  if (typeof otpRaw !== "string" || !/^\d{6}$/.test(otpRaw)) {
    return NextResponse.json(
      { error: "otp must be a 6-digit code" },
      { status: 400 },
    );
  }
  if (
    typeof newPasswordRaw !== "string" ||
    newPasswordRaw.length < PASSWORD_MIN_LENGTH ||
    newPasswordRaw.length > 200
  ) {
    return NextResponse.json(
      { error: `newPassword must be at least ${PASSWORD_MIN_LENGTH} characters` },
      { status: 400 },
    );
  }
  const email = emailRaw.trim().toLowerCase();

  // Verify the OTP FIRST (before any User lookup) so the verify
  // helper's row-bump side effect happens even when the user is
  // missing — keeps the per-purpose row accounting consistent.
  const otpResult = await verifyAndConsumeOtp(email, otpRaw, "PASSWORD_RESET");
  if (!otpResult.ok) {
    return NextResponse.json(
      { error: otpResult.error },
      { status: otpResult.status },
    );
  }

  // The OTP was valid for (email, PASSWORD_RESET) — find the
  // matching user. We could plausibly read role first so the
  // success response carries it, but reading the user up-front
  // costs the same.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!user) {
    // The OTP was valid for an email we don't have a user for.
    // That can only happen if the user was deleted between the
    // request and the confirm (rare). The OTP row is already
    // consumed (verifyAndConsumeOtp marked it) so we can't
    // surface a friendly "request was sent" — a generic 404 is
    // honest.
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 },
    );
  }

  // ---- hash + update -------------------------------------------------
  const passwordHash = await bcrypt.hash(newPasswordRaw, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash },
  });

  // Security notification — fire-and-log. If SMTP fails the
  // password reset still succeeded; we just couldn't reach the
  // user to tell them. Logged here so an operator notices.
  const noticeRes = await sendPasswordChangedNotice(email);
  if (!noticeRes.ok) {
    console.warn(
      "password-reset/confirm: sendPasswordChangedNotice failed for",
      email,
      noticeRes.reason,
    );
  }

  return NextResponse.json(
    { ok: true, role: user.role },
    { status: 200 },
  );
}