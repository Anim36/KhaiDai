// lib/otp.ts
//
// All EmailOtp-related logic in one place — so the request route,
// the verify route, and any future password-reset flow share the
// same hash / attempt-counter / rate-limit rules.
//
//   • `hashOtp(otp)` — SHA-256 hex. Used to write the row and
//     compare on verify. SHA-256 (NOT bcrypt) is intentional:
//     these codes are 6 digits = 10^6 keyspace. Across the 5
//     allowed attempts that's ~5 million SHA-256 evaluations to
//     brute-force — already expensive enough to be impractical
//     without slowing down the legitimate flow.
//   • `MAX_ATTEMPTS` — 5. After the 5th wrong attempt the row is
//     invalidated (attempts >= MAX), forcing the user to request a
//     new code.
//   • `OTP_TTL_MS` — 10 minutes. Same window the email body
//     promises so a user reading "Expires in 10 minutes" doesn't
//     hit a server that rejects earlier.
//   • The rate limit (60s cooldown + 5/hr cap) lives in the request
//     route, not here — it's a request-flow concern, not a row-
//     creation concern.

import "dotenv/config";
import { createHash, randomInt } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  // 6-digit zero-padded random integer. randomInt is cryptographically
  // strong (uses /dev/urandom under the hood) so this is the right
  // primitive for a one-time code.
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

export function hashOtp(otp: string): string {
  if (!/^\d{6}$/.test(otp)) {
    throw new Error("OTP must be exactly 6 digits");
  }
  return createHash("sha256").update(otp).digest("hex");
}

/**
 * Constant-time string comparison so a timing-attack against the
 * verify path can't recover the OTP byte-by-byte. Same length is
 * guaranteed by the SHA-256 output (always 64 hex chars) so the
 * `length === b.length` check inside `crypto.timingSafeEqual`
 * won't trip.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Self-test — call once on module load so a corrupted build that
 * changed the hash function (and would silently invalidate
 * already-sent codes) fails loudly at startup instead of after
 * the customer hits "Submit".
 */
const SELFTEST_PLAIN = "123456";
const SELFTEST_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
if (hashOtp(SELFTEST_PLAIN) !== SELFTEST_HASH) {
  // Match the literal `123456 → 8d969eef…` SHA-256 above. A change
  // here means the verify path is broken.
  throw new Error(
    "lib/otp.ts: hashOtp('123456') did not match the expected SHA-256. Did the hashing algorithm change?",
  );
}
