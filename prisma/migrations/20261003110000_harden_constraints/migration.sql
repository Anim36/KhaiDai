-- ============================================================================
-- কাজ ৩ক: Data Validation & Constraints
-- ============================================================================
-- Three categories of changes:
--
--   1. FK onDelete tightening. The prompt specifically calls out that
--      "User delete হলে তার Order মুছে যাওয়া উচিত না" — cascading
--      destroys order history, notification links, payout receipts,
--      and audit trails. We change three FKs from CASCADE to RESTRICT
--      so a User/Restaurant delete that would orphan business
--      records fails loudly instead of silently vacuuming them.
--
--      • Order.customer  : User  CASCADE → RESTRICT
--      • Review.customer : User  CASCADE → RESTRICT
--      • Restaurant.owner: User  CASCADE → RESTRICT
--      • Order.restaurant: Rest CASCADE → RESTRICT (same protection)
--
--   2. Case-insensitive email uniqueness. The login/register APIs
--      already lowercase email before the unique lookup, but the
--      DB-level UNIQUE is case-sensitive. We add a functional index
--      on `LOWER(email)` and keep the original constraint.
--
--   3. CHECK constraints on numeric columns. Postgres supports CHECK;
--      Prisma doesn't model them directly so we add them by hand.
--      A row that violates an existing data row's constraint would
--      fail the migration — but since we've already validated
--      these ranges in the API and seeded clean data, we should
--      be safe.
-- ============================================================================

-- ---- FK ONDELETE tightening -------------------------------------------------
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Order.customer (User)
  FOR constraint_rec IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"Order"'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
      AND pg_get_constraintdef(oid) LIKE '%"customerId"%'
  LOOP
    EXECUTE format('ALTER TABLE "Order" DROP CONSTRAINT %I', constraint_rec.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Order"'::regclass AND conname = 'Order_customerId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;

  -- Order.restaurant (Restaurant)
  FOR constraint_rec IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"Order"'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
      AND pg_get_constraintdef(oid) LIKE '%"restaurantId"%'
  LOOP
    EXECUTE format('ALTER TABLE "Order" DROP CONSTRAINT %I', constraint_rec.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Order"'::regclass AND conname = 'Order_restaurantId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;
  END IF;

  -- Review.customer (User)
  FOR constraint_rec IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"Review"'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
      AND pg_get_constraintdef(oid) LIKE '%"customerId"%'
  LOOP
    EXECUTE format('ALTER TABLE "Review" DROP CONSTRAINT %I', constraint_rec.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Review"'::regclass AND conname = 'Review_customerId_fkey'
  ) THEN
    ALTER TABLE "Review"
      ADD CONSTRAINT "Review_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;

  -- Restaurant.owner (User)
  FOR constraint_rec IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"Restaurant"'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
      AND pg_get_constraintdef(oid) LIKE '%"ownerId"%'
  LOOP
    EXECUTE format('ALTER TABLE "Restaurant" DROP CONSTRAINT %I', constraint_rec.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Restaurant"'::regclass AND conname = 'Restaurant_ownerId_fkey'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;
END $$;

-- ---- Case-insensitive email uniqueness -------------------------------------
-- Keep the original case-sensitive UNIQUE so case-mixed duplicates
-- detected historically still error; add a functional index that
-- gives us O(log n) lookups regardless of casing.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_idx"
  ON "User"(LOWER(email));

-- ---- CHECK constraints ------------------------------------------------------
-- Wrapped in DO blocks so a re-apply is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_rating_range_check'
  ) THEN
    ALTER TABLE "Review"
      ADD CONSTRAINT "Review_rating_range_check"
      CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_deliveryFee_range_check'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_deliveryFee_range_check"
      CHECK ("deliveryFee" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_deliveryTime_range_check'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_deliveryTime_range_check"
      CHECK ("deliveryTime" >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_latitude_range_check'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_latitude_range_check"
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_longitude_range_check'
  ) THEN
    ALTER TABLE "Restaurant"
      ADD CONSTRAINT "Restaurant_longitude_range_check"
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Address_latitude_range_check'
  ) THEN
    ALTER TABLE "Address"
      ADD CONSTRAINT "Address_latitude_range_check"
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Address_longitude_range_check'
  ) THEN
    ALTER TABLE "Address"
      ADD CONSTRAINT "Address_longitude_range_check"
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MenuItem_price_positive_check'
  ) THEN
    ALTER TABLE "MenuItem"
      ADD CONSTRAINT "MenuItem_price_positive_check"
      CHECK (price > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_amounts_nonneg_check'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_amounts_nonneg_check"
      CHECK (
        subtotal >= 0
        AND "deliveryFee" >= 0
        AND tax >= 0
        AND total >= 0
        AND "discountAmount" >= 0
        AND "discountAmount" <= subtotal
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PromoCode_discountValue_positive_check'
  ) THEN
    ALTER TABLE "PromoCode"
      ADD CONSTRAINT "PromoCode_discountValue_positive_check"
      CHECK ("discountValue" > 0);
  END IF;
END $$;
