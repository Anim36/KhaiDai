-- ============================================================================
-- ProfileNeedsReentry + VehicleNeedsReentry flags
-- ============================================================================
-- When an admin approves a PROFILE_INFO / VEHICLE_INFO change request, we
-- can't null out User.email (it's a non-null unique column) without
-- breaking login. Instead we flip a boolean flag that gates PATCH
-- /api/riders/me: while the flag is true, the rider may re-fill those
-- fields; on save, the flag clears itself.
--
-- Both default to false (no backfill needed).
-- ============================================================================

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "profileNeedsReentry" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RiderProfile"
  ADD COLUMN IF NOT EXISTS "vehicleNeedsReentry" BOOLEAN NOT NULL DEFAULT false;