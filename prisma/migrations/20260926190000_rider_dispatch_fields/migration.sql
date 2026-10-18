-- 20260926190000_rider_dispatch_fields
--
-- Step 3 of the order-flow overhaul: nearest-rider auto-dispatch.
-- Adds the bookkeeping columns Order needs to track in-flight
-- dispatch rounds.

-- ModifyEnum — `OFFERED_TO_RIDER` is the intermediate state when a
-- rider is being asked to accept the delivery (between READY and
-- PICKED_UP). Existing rows are unaffected because new enum values
-- only add to the allowed set.
ALTER TYPE "OrderStatus" ADD VALUE 'OFFERED_TO_RIDER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "dispatchedRiders" JSONB     NOT NULL DEFAULT '{"riders":[]}'::jsonb,
                    ADD COLUMN "riderResponseDeadline" TIMESTAMP(3);
