-- কাজ ২ — Forgot password. Add a new `PASSWORD_RESET` value to the
-- existing `EmailOtpPurpose` enum so password-reset OTPs share the
-- same EmailOtp table / SHA-256 hash / 10-min TTL / 5-attempt cap
-- as the registration OTPs but live in their own enum bucket.
--
-- `ALTER TYPE … ADD VALUE` is non-destructive — existing rows
-- (all of which carry the old `REGISTRATION` value) are untouched
-- and the new value is available immediately. IF NOT EXISTS makes
-- the migration idempotent so a re-run after a partial failure
-- doesn't 42P07 ("type already exists").

-- AlterEnum
ALTER TYPE "EmailOtpPurpose"
  ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';