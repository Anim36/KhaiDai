-- ============================================================================
-- কাজ ২: Restaurant "Accepting Orders" toggle + online session tracking
-- ============================================================================
-- Adds the columns + table the partner dashboard needs to expose an
-- online/offline toggle whose state survives a page refresh. Mirror of the
-- rider presence system but simpler — restaurants don't move so we don't
-- heartbeat. Fully additive:
--
--   • `isAcceptingOrders` defaults to true so every existing restaurant
--     stays "open" without manual migration.
--   • `RestaurantOnlineSession` is a brand-new table; existing rows
--     aren't backfilled because the column would be lying (we have no
--     historical record of when each restaurant was online before).
--
-- IF NOT EXISTS / DO $$ guards make the file safe to re-run.
-- ============================================================================

-- AlterTable
ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "isAcceptingOrders" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RestaurantOnlineSession" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL,
    "lastSeenAt"   TIMESTAMP(3) NOT NULL,
    "endedAt"      TIMESTAMP(3),

    CONSTRAINT "RestaurantOnlineSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RestaurantOnlineSession_restaurantId_fkey'
  ) THEN
    ALTER TABLE "RestaurantOnlineSession"
      ADD CONSTRAINT "RestaurantOnlineSession_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RestaurantOnlineSession_restaurantId_idx"
  ON "RestaurantOnlineSession"("restaurantId");
CREATE INDEX IF NOT EXISTS "RestaurantOnlineSession_startedAt_idx"
  ON "RestaurantOnlineSession"("startedAt");
