-- ============================================================================
-- কাজ ৩খ: Indexes & Performance
-- ============================================================================
-- Adds composite indexes where Prisma auto-indexes (single FK columns)
-- don't cover the common query shapes:
--
--   • "Orders for my restaurant grouped by status"
--       → Order (restaurantId, status)
--
--   • "My orders" customer list (newest first)
--       → Order (customerId, createdAt)
--
--   • "Latest order activity overall" (admin / dashboards)
--       → Order (createdAt)
--
--   • "Restaurant menu, available items only" (customer detail page)
--       → MenuItem (restaurantId, available)
--
-- All four were already (or now are) explicitly listed in `@@index` on
-- the Prisma schema. `IF NOT EXISTS` makes the file safe to re-run.
-- ============================================================================

-- Order: hot dashboard paths
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx"
  ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_status_idx"
  ON "Order"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "Order_customerId_createdAt_idx"
  ON "Order"("customerId", "createdAt");

-- MenuItem: restaurant detail page filters by availability
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_available_idx"
  ON "MenuItem"("restaurantId", "available");
