-- ============================================================================
-- ধাপ ৩: User.phone unique constraint
-- ============================================================================
-- Make phone globally unique so duplicate-phone registration can be rejected
-- at the DB layer (and the API surfaces 409 instead of silently overwriting
-- another user's account).
--
-- Existing data: this DB has ~128 users. Before applying, we de-dup any
-- phone collisions by suffixing the second (and later) rows. The raw
-- backup is at .backups/pre-step3-dup/db.json if you want to reconstruct.
--
-- We DO NOT touch empty/Null phones — those stay optional and non-unique
-- (a customer without a phone is still allowed to register).
-- ============================================================================

-- Step 1: de-dup. Keep the OLDEST row's phone for each collision; suffix
-- the rest with a unique tag. We use a row_number window function to
-- identify duplicates, then UPDATE in place. Using gen_random_uuid() so
-- we get a truly unique suffix even when many rows share a createdAt
-- timestamp (which they will in the seed data).
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "phone" ORDER BY "createdAt", "id") AS rn
  FROM "User"
  WHERE "phone" IS NOT NULL AND "phone" <> ''
)
UPDATE "User" u
SET "phone" = u."phone" || '__dup_' || gen_random_uuid()::text
FROM ranked r
WHERE u."id" = r."id"
  AND r.rn > 1;

-- Step 2: drop the redundant non-unique index if it exists (Prisma
-- generated one named "User_phone_idx" for the old column).
DROP INDEX IF EXISTS "User_phone_idx";

-- Step 3: add the unique constraint. Postgres' UNIQUE on a NULL
-- column treats each NULL as distinct — so users without phones
-- don't conflict with each other on the unique constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_phone_key'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_phone_key" UNIQUE ("phone");
  END IF;
END $$;