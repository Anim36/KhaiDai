-- ============================================================================
-- কাজ ২: Partner self-serve promo codes — schema changes
-- ============================================================================
-- Adds the scope + ownership columns needed for partners to author their own
-- promo codes. Fully additive:
--   • `restaurantId` is nullable, so existing platform-wide codes keep
--     restaurantId = NULL.
--   • `createdByPartner` defaults to false, so existing seeded codes stay
--     flagged as platform-authored.
--   • New composite indexes accelerate the partner dashboard list query
--     and the homepage carousel's "active scoped codes for a restaurant"
--     lookup.
--
-- onDelete: SetNull on restaurantId is intentional — if a restaurant is
-- later soft- or hard-deleted, any codes it owned become platform-wide
-- rather than cascading away. A deleted-restaurant audit row + an active
-- promo is more useful than a silent discount miss.
--
-- The IF NOT EXISTS guards make the file safe to re-run if a previous
-- attempt partially succeeded.
-- ============================================================================

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "createdByPartner" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PromoCode_restaurantId_fkey'
  ) THEN
    ALTER TABLE "PromoCode"
      ADD CONSTRAINT "PromoCode_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
-- The isActive+expiresAt index was created in the earlier add_promo_codes
-- migration; the IF NOT EXISTS guard makes this safe.
CREATE INDEX IF NOT EXISTS "PromoCode_isActive_expiresAt_idx"
  ON "PromoCode"("isActive", "expiresAt");
CREATE INDEX IF NOT EXISTS "PromoCode_restaurantId_isActive_idx"
  ON "PromoCode"("restaurantId", "isActive");
CREATE INDEX IF NOT EXISTS "PromoCode_restaurantId_createdAt_idx"
  ON "PromoCode"("restaurantId", "createdAt");
