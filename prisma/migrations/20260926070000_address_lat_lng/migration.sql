-- Persist the lat/lng captured by the map picker so the rider
-- app can route to the pin without re-geocoding the free-text
-- street. Both columns are nullable so older rows survive the
-- upgrade.

ALTER TABLE "Address"
  ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;

ALTER TABLE "Address"
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
