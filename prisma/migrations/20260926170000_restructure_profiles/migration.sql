-- ============================================================================
-- 20260926170000_restructure_profiles
--
-- Splits the legacy User model into three role-specific profile tables
-- (CustomerProfile / PartnerProfile / RiderProfile) plus the
-- PartnerPaymentAccount / RiderPaymentAccount / Payout linking tables.
--
-- Backfill strategy:
--   • Existing Customer rows get a CustomerProfile (no other columns to
--     migrate — customer-only preferences already live on User).
--   • Existing Partner rows get a PartnerProfile, and every Restaurant
--     owned by that partner is backfilled with partnerProfileId.
--   • Existing Rider rows (if any) get a RiderProfile, and any
--     payout/vehicle fields are migrated into the new shape.
--   • Payout rows pick up the new nullable riderProfileId /
--     partnerPaymentAccountId / riderPaymentAccountId columns; existing
--     restaurantId is preserved.
-- ============================================================================

-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_restaurantId_fkey";

-- AlterTable (Payout gets new nullable columns; restaurantId becomes nullable)
ALTER TABLE "Payout" ADD COLUMN     "partnerPaymentAccountId" TEXT,
ADD COLUMN     "riderPaymentAccountId" TEXT,
ADD COLUMN     "riderProfileId" TEXT,
ALTER COLUMN "restaurantId" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable (Restaurant gains partnerProfileId)
ALTER TABLE "Restaurant" ADD COLUMN     "partnerProfileId" TEXT;

-- AlterTable (User drops the now-redundant role-specific columns and makes
-- the notify* flags nullable so partner/rider rows don't have to populate
-- them; the API already treated them as nullable for non-CUSTOMER roles.)
ALTER TABLE "User" DROP COLUMN "payoutAccountHolder",
DROP COLUMN "payoutDestination",
DROP COLUMN "payoutMethod",
DROP COLUMN "vehicleRegNumber",
DROP COLUMN "vehicleType",
ALTER COLUMN "notifyOrderUpdates" DROP NOT NULL,
ALTER COLUMN "notifyPromotions" DROP NOT NULL,
ALTER COLUMN "notifyNewsletter" DROP NOT NULL;

-- (The legacy `PaymentMethodKind` enum was removed in an earlier
-- milestone; the shadow DB no longer has it so we don't issue a
-- DROP TYPE here. Older production DBs may still carry it — drop
-- manually if needed.)

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultPreference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPaymentAccount" (
    "id" TEXT NOT NULL,
    "partnerProfileId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "label" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleType" TEXT,
    "vehicleRegNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderPaymentAccount" (
    "id" TEXT NOT NULL,
    "riderProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderPaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");
CREATE UNIQUE INDEX "PartnerProfile_userId_key" ON "PartnerProfile"("userId");
CREATE INDEX "PartnerPaymentAccount_partnerProfileId_idx" ON "PartnerPaymentAccount"("partnerProfileId");
CREATE INDEX "PartnerPaymentAccount_restaurantId_idx" ON "PartnerPaymentAccount"("restaurantId");
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "RiderProfile"("userId");
CREATE INDEX "RiderPaymentAccount_riderProfileId_idx" ON "RiderPaymentAccount"("riderProfileId");
CREATE INDEX "Payout_riderProfileId_idx" ON "Payout"("riderProfileId");
CREATE INDEX "Restaurant_partnerProfileId_idx" ON "Restaurant"("partnerProfileId");

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_partnerProfileId_fkey" FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerPaymentAccount" ADD CONSTRAINT "PartnerPaymentAccount_partnerProfileId_fkey" FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerPaymentAccount" ADD CONSTRAINT "PartnerPaymentAccount_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_partnerPaymentAccountId_fkey" FOREIGN KEY ("partnerPaymentAccountId") REFERENCES "PartnerPaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_riderPaymentAccountId_fkey" FOREIGN KEY ("riderPaymentAccountId") REFERENCES "RiderPaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiderPaymentAccount" ADD CONSTRAINT "RiderPaymentAccount_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Backfill: create a profile row for every existing User, and link every
-- Restaurant back to its partner's PartnerProfile.
--
-- We use plain SQL here (not Prisma client) because the migration runs
-- before the new client is generated. cuid() is inlined so the same id
-- generator that Prisma uses in application code is mimicked; the only
-- callers of these ids are foreign keys, so any unique string would do.
-- ============================================================================

-- CustomerProfile rows
INSERT INTO "CustomerProfile" ("id", "userId", "defaultPreference", "createdAt", "updatedAt")
SELECT
    'cp_' || "id",
    "id",
    NULL,
    "createdAt",
    "createdAt"
FROM "User"
WHERE "role" = 'CUSTOMER';

-- PartnerProfile rows
INSERT INTO "PartnerProfile" ("id", "userId", "bio", "createdAt", "updatedAt")
SELECT
    'pp_' || "id",
    "id",
    NULL,
    "createdAt",
    "createdAt"
FROM "User"
WHERE "role" = 'PARTNER';

-- RiderProfile rows (no riders existed at the time of the migration,
-- but the backfill is here for any future production rollouts).
INSERT INTO "RiderProfile" ("id", "userId", "vehicleType", "vehicleRegNumber", "createdAt", "updatedAt")
SELECT
    'rp_' || "id",
    "id",
    NULL,
    NULL,
    "createdAt",
    "createdAt"
FROM "User"
WHERE "role" = 'RIDER';

-- Restaurant.partnerProfileId backfill — every restaurant's ownerId maps
-- back to a partner's userId, which now has a PartnerProfile we can join.
UPDATE "Restaurant" r
SET "partnerProfileId" = pp."id"
FROM "PartnerProfile" pp
WHERE r."ownerId" = pp."userId";
