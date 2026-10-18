-- Persist the lat/lng captured by the partner's map picker so the
-- customer-facing listing can rank by distance.
-- Both columns are nullable: seeded restaurants predate the picker
-- and the listing endpoint gracefully falls back to "no distance".

ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;

ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
