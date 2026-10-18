-- 20260926180000_rider_location_tracking
--
-- Adds the live-tracking fields to RiderProfile:
--   • currentLat / currentLng — last known lat/lng (set by the rider
--     dashboard via /api/riders/location every ~15s when online).
--   • lastLocationUpdate — server timestamp of that last ping.
--   • isOnline — boolean the rider flips on the dashboard. Pushed to
--     false on logout / app background.
--
-- These fields drive:
--   • The customer-facing real-time tracking map on /orders/[id]/track.
--   • The nearest-rider dispatch query (Step 3 in the order-flow work).

-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN "currentLat" DOUBLE PRECISION,
                          ADD COLUMN "currentLng" DOUBLE PRECISION,
                          ADD COLUMN "lastLocationUpdate" TIMESTAMP(3),
                          ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;
