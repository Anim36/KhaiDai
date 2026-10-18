-- Add the Payout model + supporting enums for partner withdrawals.
--
--   - PayoutMethod  — bKash / Nagad / Rocket / Card. Matches the
--                      four chips on the partner Earnings page's
--                      "Request Payout" modal.
--   - PayoutStatus  — PENDING / PROCESSING / COMPLETED / FAILED.
--                      The first one is what every newly-created
--                      request starts as until the (future) gateway
--                      integration flips it to COMPLETED.
--
-- `Payout.amount` is in Taka (Int) like the rest of the monetary
-- columns in this schema.
--
-- Both enum migrations are idempotent (`IF NOT EXISTS` is Postgres
-- 9.6+ for CREATE TYPE). The Payout table is too, via CREATE TABLE
-- IF NOT EXISTS for the shell and the regular `ADD COLUMN IF NOT
-- EXISTS` for safety.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayoutMethod') THEN
    CREATE TYPE "PayoutMethod" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'CARD');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayoutStatus') THEN
    CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "Payout" (
  "id"           TEXT PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "amount"       INTEGER NOT NULL,
  "method"       "PayoutMethod" NOT NULL,
  "destination"  TEXT NOT NULL,
  "note"         TEXT,
  "status"       "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payout_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Payout_restaurantId_idx" ON "Payout" ("restaurantId");
CREATE INDEX IF NOT EXISTS "Payout_status_idx"        ON "Payout" ("status");
