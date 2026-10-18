-- ============================================================================
-- কাজ ৩গ: Soft Delete
-- ============================================================================
-- Adds a nullable `deletedAt` column to User, Restaurant, and MenuItem
-- and a partial index on each so list queries can short-circuit
-- `WHERE deletedAt IS NULL` to an index seek.
--
-- Why these three (and not Order / Review / PromoCode):
--   • User     — the customer-facing account model; deletion must be
--                reversible for "I deleted my account, but actually
--                I just want to log out" recovery flows.
--   • Restaurant — historical Order rows FK to Restaurant; soft-
--                deleting keeps the order history readable.
--   • MenuItem — historical OrderItem rows FK to MenuItem (with
--                `onDelete: Restrict`, which means we *couldn't*
--                hard-delete anyway); soft-delete matches the
--                existing behaviour.
--
-- The partial indexes keep the working-set small: only rows that
-- HAVEN'T been deleted need to be in the lookup index.
-- ============================================================================

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- CreateIndex (partial — only indexes the live rows, so the index
-- stays small even as soft-deletes accumulate).
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx"
  ON "User"("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Restaurant_deletedAt_idx"
  ON "Restaurant"("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "MenuItem_deletedAt_idx"
  ON "MenuItem"("deletedAt") WHERE "deletedAt" IS NULL;
