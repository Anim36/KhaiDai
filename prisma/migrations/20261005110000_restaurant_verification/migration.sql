-- ============================================================================
-- ধাপ ৪: Restaurant verification workflow
-- ============================================================================
-- Adds the admin approval gate for restaurants:
--   • New columns: verificationStatus, verifiedByAdminId, verifiedAt,
--     rejectionReason. Default PENDING so existing rows stay visible
--     (we mark all currently-active restaurants as APPROVED below
--     so the demo data isn't suddenly hidden).
--   • New model: RestaurantDocument (id, restaurantId, documentType,
--     fileUrl, uploadedAt). Cascade on restaurant delete.
--   • Self-relation: User.verifiedRestaurants <-> Restaurant.verifiedByAdmin
--     so admin accounts can see their review history.
--
-- We DON'T touch isSuspended or deletedAt — those are separate
-- partner-vs-admin gates.
-- ============================================================================

-- CreateEnum (idempotent — DO/EXCEPTION pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationStatus') THEN
    CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RestaurantDocumentType') THEN
    CREATE TYPE "RestaurantDocumentType" AS ENUM (
      'TRADE_LICENSE',
      'OWNER_NID',
      'FOOD_SAFETY_CERT',
      'OTHER'
    );
  END IF;
END $$;

-- Add columns (defaults to PENDING; we'll backfill existing rows to
-- APPROVED in a separate step so the demo data doesn't vanish).
ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "verifiedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Backfill: existing restaurants are grandfathered in as APPROVED.
-- We intentionally don't mark them as PENDING because the demo
-- restaurant list was populated before this migration; flipping
-- every existing row to PENDING would hide them all from the
-- customer homepage until an admin reviewed them.
UPDATE "Restaurant"
SET "verificationStatus" = 'APPROVED',
    "verifiedAt" = COALESCE("verifiedAt", "createdAt")
WHERE "verificationStatus" = 'PENDING'
  AND "deletedAt" IS NULL;

-- Self-relation FK — admin (User) → Restaurant. SetNull on delete so
-- deleting an admin doesn't cascade-wipe the restaurants they
-- approved (just clears the verifiedByAdminId pointer).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_verifiedByAdminId_fkey'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_verifiedByAdminId_fkey"
      FOREIGN KEY ("verifiedByAdminId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex for the admin queue's hot lookup: "all PENDING rows".
CREATE INDEX IF NOT EXISTS "Restaurant_verificationStatus_idx"
  ON "Restaurant"("verificationStatus");

-- CreateTable for RestaurantDocument. Cascade-delete so removing
-- the restaurant cleans up its documents.
CREATE TABLE IF NOT EXISTS "RestaurantDocument" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "documentType" "RestaurantDocumentType" NOT NULL,
    "fileUrl"      TEXT NOT NULL,
    "uploadedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantDocument_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RestaurantDocument_restaurantId_fkey'
  ) THEN
    ALTER TABLE "RestaurantDocument"
      ADD CONSTRAINT "RestaurantDocument_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "RestaurantDocument_restaurantId_idx"
  ON "RestaurantDocument"("restaurantId");