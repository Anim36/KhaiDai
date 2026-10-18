-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payoutAccountHolder" TEXT,
ADD COLUMN     "payoutDestination" TEXT,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "vehicleRegNumber" TEXT,
ADD COLUMN     "vehicleType" TEXT;
