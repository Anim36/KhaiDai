-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Restaurant" DROP CONSTRAINT "Restaurant_ownerId_fkey";

-- Note: the Review FK hardening that USED to live here has been
-- moved to 20261001100000_add_reviews. Reason: at this point in
-- the replay chain, the Review table doesn't exist yet -- it is
-- created two migrations later. Dropping and re-adding
-- Review_customerId_fkey here therefore breaks the scratch
-- replay (the DROP CONSTRAINT references a table that is not
-- there). The desired final state -- Review.customerId with ON
-- DELETE RESTRICT -- is set in add_reviews directly, so the live
-- DB ends up in the same shape whether the chain is replayed from
-- scratch or applied against a DB that already had Review from
-- some other source.

-- DropIndex
DROP INDEX "Restaurant_isSuspended_idx";

-- DropIndex
DROP INDEX "User_isSuspended_idx";

-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN     "notifyNewRequest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyPayout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyWeeklySummary" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;