-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('RESTAURANT', 'RIDER');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "dispatchedRiders" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "ReviewKind" NOT NULL,
    "restaurantId" TEXT,
    "riderId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "replyText" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "Review_restaurantId_idx" ON "Review"("restaurantId");

-- CreateIndex
CREATE INDEX "Review_riderId_idx" ON "Review"("riderId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_kind_key" ON "Review"("orderId", "kind");

-- AddForeignKey
-- Review.customerId → User.id: RESTRICT (was CASCADE in earlier
-- drafts). Matches `prisma/schema.prisma`'s `customer` relation,
-- which omits `onDelete` so Prisma emits NoAction (≈ RESTRICT) on
-- generate. Hardening mirrors the same change applied to
-- `Order.customerId` and `Restaurant.ownerId` in
-- 20260928143135_rider_notify_prefs.
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
