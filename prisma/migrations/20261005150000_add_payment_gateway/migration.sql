-- ধাপ ১: SSLCommerz gateway fields.
-- Safe additive migration: every new column is nullable / has a
-- default, so existing rows backfill cleanly. We deliberately do
-- NOT rename or split the `PaymentMethod` enum — COD + bKash /
-- Nagad / Rocket / Card stay as-is; the new `PaymentGatewayStatus`
-- column tracks the gateway round-trip independently.

-- CreateEnum
CREATE TYPE "PaymentGatewayStatus" AS ENUM (
  'NOT_INITIATED',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED'
);

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN "paymentGatewayStatus" "PaymentGatewayStatus" NOT NULL DEFAULT 'NOT_INITIATED',
  ADD COLUMN "gatewayTransactionId" TEXT,
  ADD COLUMN "gatewaySessionKey"   TEXT;

-- CreateIndex
-- Hot path: Partner Orders query excludes unpaid gateway orders
-- (NOT_INITIATED / FAILED / CANCELLED). Composite index keeps
-- the scan cheap even when many ghost orders accumulate.
CREATE INDEX "Order_restaurantId_paymentGatewayStatus_idx"
  ON "Order" ("restaurantId", "paymentGatewayStatus");