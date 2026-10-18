-- Split the legacy single "User"."notificationsEnabled" flag into
-- three independent booleans so the Settings panel can flip each
-- notification category on its own without affecting the others.
--
--   notifyOrderUpdates  → order status SMS / push (default true)
--   notifyPromotions    → discounts, new restaurants (default true)
--   notifyNewsletter    → monthly best-of email (default true)
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS
-- are no-ops the second time around.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notifyOrderUpdates" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notifyPromotions" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notifyNewsletter" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "notificationsEnabled";
