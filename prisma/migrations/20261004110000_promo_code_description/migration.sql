-- ============================================================================
-- কাজ ৫: PromoCode.description
-- ============================================================================
-- Adds an optional `description` column on PromoCode so the admin /
-- partner forms can attach a short tagline to a code ("Free delivery on
-- orders over ৳200"). The customer-side surfaces (homepage carousel +
-- restaurant detail chip modal) read this directly.
--
-- Null-safe: existing rows keep NULL and continue to render their
-- code + discount fields only.
-- ============================================================================

ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "description" TEXT;