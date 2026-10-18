-- ============================================================================
-- ধাপ ৫: Rider verification workflow
-- ============================================================================
-- Mirrors ধাপ ৪'s restaurant approval flow:
--   • Add columns: verificationStatus, verifiedByAdminId, verifiedAt,
--     rejectionReason. Default PENDING. Existing riders are
--     grandfathered as APPROVED so the demo data isn't suddenly
--     excluded from dispatch.
--   • New model: RiderDocument (NID, driving licence, vehicle
--     registration). Cascade-delete on rider.
--   • Self-relation: User.verifiedRiders <-> RiderProfile.verifiedByAdmin.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RiderDocumentType') THEN
    CREATE TYPE "RiderDocumentType" AS ENUM (
      'NID',
      'DRIVING_LICENSE',
      'VEHICLE_REGISTRATION',
      'OTHER'
    );
  END IF;
END $$;

ALTER TABLE "RiderProfile"
  ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "verifiedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Backfill existing riders as APPROVED so dispatch keeps working
-- in the demo data without an admin review pass.
UPDATE "RiderProfile"
SET "verificationStatus" = 'APPROVED',
    "verifiedAt" = COALESCE("verifiedAt", "createdAt")
WHERE "verificationStatus" = 'PENDING';

-- Self-relation FK to admin (User). SetNull on admin delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RiderProfile_verifiedByAdminId_fkey'
  ) THEN
    ALTER TABLE "RiderProfile"
      ADD CONSTRAINT "RiderProfile_verifiedByAdminId_fkey"
      FOREIGN KEY ("verifiedByAdminId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "RiderProfile_verificationStatus_idx"
  ON "RiderProfile"("verificationStatus");

CREATE TABLE IF NOT EXISTS "RiderDocument" (
    "id"             TEXT NOT NULL,
    "riderProfileId" TEXT NOT NULL,
    "documentType"   "RiderDocumentType" NOT NULL,
    "fileUrl"        TEXT NOT NULL,
    "uploadedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderDocument_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RiderDocument_riderProfileId_fkey'
  ) THEN
    ALTER TABLE "RiderDocument"
      ADD CONSTRAINT "RiderDocument_riderProfileId_fkey"
      FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "RiderDocument_riderProfileId_idx"
  ON "RiderDocument"("riderProfileId");