-- ============================================================================
-- ধাপ ২: EmailOtp — single-purpose email verification for registration
-- ============================================================================
-- Adds the EmailOtp model + EmailOtpPurpose enum. The OTP itself is never
-- stored — we save SHA-256(otp) so a leaked DB snapshot still can't be
-- used to log in as a customer.
--
-- The composite (email, purpose, consumedAt) index is what the verify
-- route uses to find "the latest unconsumed OTP for this email+purpose".
-- Adding it as a plain b-tree (not a partial index) keeps the DDL
-- portable across old Postgres versions and the lookup is still cheap
-- because consumed rows drop out of the result set within seconds.
-- ============================================================================

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailOtpPurpose') THEN
    CREATE TYPE "EmailOtpPurpose" AS ENUM ('REGISTRATION');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailOtp" (
    "id"         TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "otpHash"    TEXT NOT NULL,
    "purpose"    "EmailOtpPurpose" NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOtp_email_purpose_consumedAt_idx"
  ON "EmailOtp"("email", "purpose", "consumedAt");