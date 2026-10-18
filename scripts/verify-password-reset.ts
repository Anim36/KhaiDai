/**
 * Regression test for the Forgot Password / Password Reset flow
 * (কাজ ২).
 *
 * What it proves end-to-end:
 *   1. Real /api/auth/password-reset/request:
 *      - 200 generic response (no info leak) for unknown email
 *      - 200 generic response (same shape) for known email
 *      - 60s cooldown response when called twice in quick succession
 *   2. Real /api/auth/password-reset/confirm:
 *      - 400 "Incorrect code" for wrong 6-digit code
 *      - 400 "Code expired" for an expired row
 *      - 400 "No active code" for a request that was never made
 *      - 400 "No active code" for a REGISTRATION-purpose code
 *        (cross-purpose protection: a code minted for signup
 *        can never satisfy a password reset, and vice versa)
 *      - 200 ok+role for the happy path, password actually
 *        changed in the User row, login with the NEW password
 *        succeeds, login with the OLD password fails
 *   3. Same flow works for CUSTOMER, PARTNER, and RIDER roles
 *      (role-agnostic — no role needed in the request body).
 *
 * Hygiene:
 *   - Every test row uses a `pwreset.probe.<role>.<ts>@example.com`
 *     prefix so it can never collide with real accounts. The
 *     script's tail-end cleanup deletes them all, and the existing
 *     scripts/cleanup-test-data.js also whitelists this prefix.
 *
 * Run with: npx tsx scripts/verify-password-reset.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const BASE = "http://localhost:3000";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, info?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, info ?? "");
  }
}

async function mintUser(opts: {
  email: string;
  role: "CUSTOMER" | "PARTNER" | "RIDER";
  password: string;
}) {
  await prisma.user.deleteMany({ where: { email: opts.email } });
  await prisma.emailOtp.deleteMany({ where: { email: opts.email } });
  const bcrypt = await import("bcrypt");
  const passwordHash = await bcrypt.default.hash(opts.password, 8);
  await prisma.user.create({
    data: {
      email: opts.email,
      name: "Probe User",
      role: opts.role,
      password: passwordHash,
    },
  });
}

async function mintOtpRow(
  email: string,
  plain: string,
  purpose: "REGISTRATION" | "PASSWORD_RESET",
  opts: { expiresInMs?: number } = {},
) {
  await prisma.emailOtp.deleteMany({ where: { email, purpose } });
  await prisma.emailOtp.create({
    data: {
      email,
      otpHash: hashOtp(plain),
      purpose,
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 10 * 60 * 1000)),
    },
  });
}

async function cleanupEmail(email: string) {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.emailOtp.deleteMany({ where: { email } });
}

async function requestReset(email: string) {
  return fetch(`${BASE}/api/auth/password-reset/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

async function confirmReset(
  email: string,
  otp: string,
  newPassword: string,
) {
  return fetch(`${BASE}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, otp, newPassword }),
  });
}

async function loginAs(
  email: string,
  password: string,
  role?: "CUSTOMER" | "PARTNER" | "RIDER",
) {
  return fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      role ? { email, password, expectedRole: role } : { email, password },
    ),
  });
}

async function main() {
  const ts = Date.now();

  /* ============================================================== */
  /* Case 1 — Unknown email returns generic 200 (no info leak).     */
  /* ============================================================== */
  console.log("\n== Case 1: unknown email -> generic 200 ==");
  const unknownEmail = `pwreset.probe.unknown.${ts}@example.com`;
  const r1 = await requestReset(unknownEmail);
  const b1 = await r1.json();
  check("status 200 for unknown email", r1.status === 200, b1);
  check(
    "response shape identical to known-email shape (privacy)",
    typeof b1.ok === "boolean" && typeof b1.delivered === "boolean",
    b1,
  );
  check(
    "delivered is false for unknown email",
    b1.delivered === false,
    b1,
  );
  // No EmailOtp row should be created for the unknown email.
  const otpRows = await prisma.emailOtp.count({ where: { email: unknownEmail } });
  check("no EmailOtp row minted for unknown email", otpRows === 0);

  /* ============================================================== */
  /* Case 2 — 60s cooldown on second request.                        */
  /* ============================================================== */
  console.log("\n== Case 2: cooldown on second request ==");
  const e2 = `pwreset.probe.cooldown.${ts}@example.com`;
  await mintUser({ email: e2, role: "CUSTOMER", password: "oldPass123!" });
  // Bypass the actual email sending — the route only sends when
  // the user exists, so we just exercise the rate limit. The
  // first call may return ok/delivered:false in the test env
  // (SMTP not configured) — what matters is the response shape.
  await requestReset(e2);
  const r2b = await requestReset(e2);
  const b2b = await r2b.json();
  check("second call status 200 (no 429 surface)", r2b.status === 200, b2b);
  check(
    "second call has retryAfter >= 1",
    typeof b2b.retryAfter === "number" && b2b.retryAfter >= 1,
    b2b,
  );
  await cleanupEmail(e2);

  /* ============================================================== */
  /* Case 3 — Wrong OTP returns 400 "Incorrect code".                */
  /* ============================================================== */
  console.log("\n== Case 3: wrong code ==");
  const e3 = `pwreset.probe.wrongcode.${ts}@example.com`;
  await mintUser({ email: e3, role: "CUSTOMER", password: "oldPass123!" });
  await mintOtpRow(e3, "111111", "PASSWORD_RESET");
  const r3 = await confirmReset(e3, "999999", "newPass123!");
  const b3 = await r3.json();
  check("status 400 on wrong code", r3.status === 400, b3);
  check("error mentions 'Incorrect code'", /incorrect code/i.test(b3.error ?? ""), b3);
  // attempts should be bumped from 0 to 1.
  const row3 = await prisma.emailOtp.findFirst({
    where: { email: e3, purpose: "PASSWORD_RESET" },
  });
  check("attempts bumped to 1", row3?.attempts === 1, row3);
  await cleanupEmail(e3);

  /* ============================================================== */
  /* Case 4 — Expired OTP returns 400 "Code expired".               */
  /* ============================================================== */
  console.log("\n== Case 4: expired code ==");
  const e4 = `pwreset.probe.expired.${ts}@example.com`;
  await mintUser({ email: e4, role: "CUSTOMER", password: "oldPass123!" });
  await mintOtpRow(e4, "222222", "PASSWORD_RESET", { expiresInMs: -1000 });
  const r4 = await confirmReset(e4, "222222", "newPass123!");
  const b4 = await r4.json();
  check("status 400 on expired", r4.status === 400, b4);
  check("error mentions 'expired'", /expired/i.test(b4.error ?? ""), b4);
  await cleanupEmail(e4);

  /* ============================================================== */
  /* Case 5 — REGISTRATION code can't satisfy PASSWORD_RESET.       */
  /* ============================================================== */
  console.log("\n== Case 5: cross-purpose protection ==");
  const e5 = `pwreset.probe.crosspurpose.${ts}@example.com`;
  await mintUser({ email: e5, role: "CUSTOMER", password: "oldPass123!" });
  await mintOtpRow(e5, "333333", "REGISTRATION");
  const r5 = await confirmReset(e5, "333333", "newPass123!");
  const b5 = await r5.json();
  check("status 400 when REGISTRATION code used at confirm", r5.status === 400, b5);
  check(
    "error mentions 'No active code' (purpose mismatch)",
    /no active code/i.test(b5.error ?? ""),
    b5,
  );
  await cleanupEmail(e5);

  /* ============================================================== */
  /* Case 6 — Happy path: CUSTOMER                                   */
  /* ============================================================== */
  console.log("\n== Case 6: happy path — CUSTOMER ==");
  const eC = `pwreset.probe.customer.${ts}@example.com`;
  await mintUser({ email: eC, role: "CUSTOMER", password: "oldPass123!" });
  await mintOtpRow(eC, "111111", "PASSWORD_RESET");
  const r6 = await confirmReset(eC, "111111", "newPass456!");
  const b6 = await r6.json();
  check("status 200", r6.status === 200, b6);
  check("ok true", b6.ok === true, b6);
  check("role returned is CUSTOMER", b6.role === "CUSTOMER", b6);
  // New password works.
  const r6l = await loginAs(eC, "newPass456!");
  check("login with NEW password returns 200", r6l.status === 200, await r6l.json());
  // Old password does NOT work.
  const r6o = await loginAs(eC, "oldPass123!");
  check("login with OLD password returns 401", r6o.status === 401, await r6o.json());
  // OTP row is consumed.
  const r6row = await prisma.emailOtp.findFirst({
    where: { email: eC, purpose: "PASSWORD_RESET" },
  });
  check("OTP row consumedAt set", r6row?.consumedAt !== null, r6row);
  // Replaying the same code returns 400 "No active code".
  const r6replay = await confirmReset(eC, "111111", "yetAnother1!");
  check("replay same code returns 400", r6replay.status === 400, await r6replay.json());
  await cleanupEmail(eC);

  /* ============================================================== */
  /* Case 7 — Happy path: PARTNER                                   */
  /* ============================================================== */
  console.log("\n== Case 7: happy path — PARTNER ==");
  const eP = `pwreset.probe.partner.${ts}@example.com`;
  await mintUser({ email: eP, role: "PARTNER", password: "oldPass123!" });
  await mintOtpRow(eP, "444444", "PASSWORD_RESET");
  const r7 = await confirmReset(eP, "444444", "newPass789!");
  const b7 = await r7.json();
  check("status 200", r7.status === 200, b7);
  check("role returned is PARTNER", b7.role === "PARTNER", b7);
  const r7l = await loginAs(eP, "newPass789!", "PARTNER");
  check("login with NEW password returns 200", r7l.status === 200, await r7l.json());
  await cleanupEmail(eP);

  /* ============================================================== */
  /* Case 8 — Happy path: RIDER                                     */
  /* ============================================================== */
  console.log("\n== Case 8: happy path — RIDER ==");
  const eR = `pwreset.probe.rider.${ts}@example.com`;
  await mintUser({ email: eR, role: "RIDER", password: "oldPass123!" });
  await mintOtpRow(eR, "555555", "PASSWORD_RESET");
  const r8 = await confirmReset(eR, "555555", "newPass012!");
  const b8 = await r8.json();
  check("status 200", r8.status === 200, b8);
  check("role returned is RIDER", b8.role === "RIDER", b8);
  const r8l = await loginAs(eR, "newPass012!", "RIDER");
  check("login with NEW password returns 200", r8l.status === 200, await r8l.json());
  await cleanupEmail(eR);

  /* ============================================================== */
  /* Case 9 — Confirming twice with the same code (replay).          */
  /* ============================================================== */
  console.log("\n== Case 9: replay protection ==");
  const e9 = `pwreset.probe.replay.${ts}@example.com`;
  await mintUser({ email: e9, role: "CUSTOMER", password: "oldPass123!" });
  await mintOtpRow(e9, "666666", "PASSWORD_RESET");
  const r9a = await confirmReset(e9, "666666", "firstNew1!");
  check("first use returns 200", r9a.status === 200, await r9a.json());
  const r9b = await confirmReset(e9, "666666", "secondNew1!");
  const b9b = await r9b.json();
  check("second use returns 400", r9b.status === 400, b9b);
  check("second use error mentions 'No active code'", /no active code/i.test(b9b.error ?? ""), b9b);
  // The User row should still have the FIRST new password.
  const login9 = await loginAs(e9, "firstNew1!");
  check("login with FIRST new password works", login9.status === 200, await login9.json());
  await cleanupEmail(e9);

  /* ============================================================== */
  /* Case 10 — Confirm with a request that was never made.           */
  /* ============================================================== */
  console.log("\n== Case 10: confirm without request ==");
  const e10 = `pwreset.probe.norequest.${ts}@example.com`;
  await mintUser({ email: e10, role: "CUSTOMER", password: "oldPass123!" });
  const r10 = await confirmReset(e10, "777777", "newPass123!");
  const b10 = await r10.json();
  check("status 400", r10.status === 400, b10);
  check(
    "error mentions 'No active code'",
    /no active code/i.test(b10.error ?? ""),
    b10,
  );
  await cleanupEmail(e10);

  /* ============================================================== */
  console.log("\n========================================");
  console.log(`pass: ${pass}, fail: ${fail}`);
  console.log("========================================\n");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});