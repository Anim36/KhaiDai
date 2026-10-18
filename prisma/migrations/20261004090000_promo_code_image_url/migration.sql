-- ============================================================================
-- কাজ ২ (carousel): PromoCode.imageUrl
-- ============================================================================
-- Adds an optional `imageUrl` column on PromoCode so the homepage promo
-- carousel can render a real per-code thumbnail instead of just the
-- generic TicketIcon fallback. The value is either a data URL (uploaded
-- by the partner form) or an external https URL; we don't constrain the
-- format here so the API layer can decide on validation rules later.
--
-- Null-safe: existing rows keep their NULL imageUrl and continue to
-- render the fallback gradient/icon until a partner or admin sets one.
--
-- No index is added — the column is only read when the row is already
-- in the result set, so an index wouldn't be hit by any query.
-- ============================================================================

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;