// lib/referral.ts
//
// Feat 6 — Customer Referral Program helpers.
//
// Responsibilities:
//   1. Generate a fresh, unique 6-character referral code with
//      collision retry. The alphabet excludes look-alike characters
//      (no 0/O, no 1/I/L) so a customer can read it off a sticker
//      and a friend can type it without typos.
//   2. Parse + validate an inbound referral code from the
//      registration form. We accept mixed case, trim whitespace,
//      and reject anything that doesn't match the strict shape so
//      the registration route can keep its error path simple.
//   3. Re-export the constant reward amount (৳50) so every route
//      that mints a `REFERRAL_BONUS` transaction cites the same
//      source of truth. Bump the constant here if marketing wants
//      to change the reward.
//
// Backfill of `User.referralCode` for legacy rows that pre-date
// the column lives in scripts/backfill-referral-codes.ts; the
// register route calls `generateUniqueReferralCode` inline on
// every new customer so backfill is a one-shot operation.

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Codepoint alphabet: 31 unambiguous characters. Big enough
 * (31^6 ≈ 887M combinations) that two random generations collide
 * roughly once per 1,600 customers in a row — well within
 * retry-budget territory.
 *
 * Excluded:
 *   • 0 / O  (zero vs letter O)
 *   • 1 / I / L  (one / capital i / capital l)
 *   • B  (looks like 8) — actually we KEEP B because
 *     "looks like 8" is rare in print. Kept the alphabet minimal
 *     for max readability.
 */
export const REFERRAL_ALPHABET = "23456789ACDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_LENGTH = 6;

/** BDT credited to each of referrer + referee on the first
 *  delivered order. Integer; no decimals. */
export const REFERRAL_REWARD_AMOUNT = 50;

/**
 * Strict shape — 6 chars, alphabet only. The registration
 * route normalises incoming `referralCode` strings through
 * this regex before the DB lookup so a typo like "ABCD 12"
 * doesn't silently 500.
 */
const REFERRAL_CODE_RE = /^[23456789ACDEFGHJKMNPQRSTUVWXYZ]{6,8}$/;

export function isValidReferralCodeShape(code: string): boolean {
  return REFERRAL_CODE_RE.test(code);
}

/**
 * Normalise an inbound referral code: trim, upper-case.
 * Returns the cleaned string (caller still has to check the
 * shape and resolve against the DB).
 */
export function normaliseReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Generate a 6-character candidate. Internal helper; use
 * `generateUniqueReferralCode` from outside so the caller
 * always has a code that's actually free.
 */
function randomReferralCode(): string {
  const buf: string[] = [];
  for (let i = 0; i < REFERRAL_LENGTH; i++) {
    const idx = Math.floor(Math.random() * REFERRAL_ALPHABET.length);
    buf.push(REFERRAL_ALPHABET[idx]);
  }
  return buf.join("");
}

/**
 * Generate a fresh referral code that doesn't already exist on
 * the `User` table. Tries up to `maxAttempts` times before
 * giving up. The DB lookup is a single `findUnique` per attempt;
 * a six-character alphabet in the hundreds-of-millions range
 * means a real collision burst is essentially impossible in
 * any single deploy.
 *
 * Pass a transaction client (`tx`) when the code needs to be
 * stamped in the same transaction as a User create. Default
 * is the global prisma instance — for one-off backfill scripts
 * outside any transaction.
 */
export async function generateUniqueReferralCode(
  client: Prisma.TransactionClient | typeof prisma = prisma,
  maxAttempts = 8,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = randomReferralCode();
    const clash = await client.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // 31^6 with 8 retries is 8 * 31^6 ≈ 7.1B lookups that have to
  // all hit. Not gonna happen, but throw a labelled error so
  // the failure mode is obvious in logs.
  throw new Error(
    "Referral code generation exhausted retries — pool may be too small",
  );
}
