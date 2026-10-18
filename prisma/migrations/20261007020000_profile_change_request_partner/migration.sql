-- Add PARTNER to ProfileChangeRequestRole + RESTAURANT_PROFILE /
-- RESTAURANT_LOCATION to ProfileChangeRequestType. ALTER TYPE ADD VALUE
-- cannot run inside a transaction block on older Postgres, so we use
-- IF NOT EXISTS (PG 12+) and run each line outside of BEGIN/COMMIT.

ALTER TYPE "ProfileChangeRequestRole" ADD VALUE IF NOT EXISTS 'PARTNER';
ALTER TYPE "ProfileChangeRequestType" ADD VALUE IF NOT EXISTS 'RESTAURANT_PROFILE';
ALTER TYPE "ProfileChangeRequestType" ADD VALUE IF NOT EXISTS 'RESTAURANT_LOCATION';

-- Optional FK to the Restaurant when the requester is a PARTNER.
-- Nullable so the existing RIDER rows (and any in-flight PENDINGs)
-- stay valid. ON DELETE CASCADE so a deleted restaurant doesn't
-- leave orphan requests behind.
ALTER TABLE "ProfileChangeRequest" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProfileChangeRequest_restaurantId_fkey'
  ) THEN
    ALTER TABLE "ProfileChangeRequest"
      ADD CONSTRAINT "ProfileChangeRequest_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Lookup index for partner dashboard: latest request per restaurant +
-- type so the Settings page can render badges in one query.
CREATE INDEX IF NOT EXISTS "ProfileChangeRequest_restaurantId_requestType_status_idx"
  ON "ProfileChangeRequest"("restaurantId", "requestType", "status");

-- Restaurant needs-reentry flags (Rider-side mirrors these on
-- User.profileNeedsReentry and RiderProfile.vehicleNeedsReentry).
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "profileNeedsReentry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "locationNeedsReentry" BOOLEAN NOT NULL DEFAULT false;