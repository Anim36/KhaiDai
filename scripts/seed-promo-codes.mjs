/**
 * scripts/seed-promo-codes.mjs
 *
 * Idempotently insert / refresh a handful of demo promo codes so the
 * checkout flow has something to validate against while we don't have
 * an admin UI yet.
 *
 *   WELCOME50  — flat ৳50 off, no minimum
 *   SAVE10     — 10% off, capped at ৳100
 *   KHADAI20   — 20% off, requires ৳500 minimum
 *   FREESHIP   — ৳30 off (subtotal >= 200)
 *
 * Usage:  node scripts/seed-promo-codes.mjs
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const FIXTURES = [
  {
    code: "WELCOME50",
    discountType: "FIXED",
    discountValue: 50,
    minOrderAmount: null,
    maxDiscount: null,
    expiresAt: null,
    isActive: true,
    usageLimit: null,
  },
  {
    code: "SAVE10",
    discountType: "PERCENTAGE",
    discountValue: 10,
    minOrderAmount: null,
    maxDiscount: 100,
    expiresAt: null,
    isActive: true,
    usageLimit: null,
  },
  {
    code: "KHADAI20",
    discountType: "PERCENTAGE",
    discountValue: 20,
    minOrderAmount: 500,
    maxDiscount: 200,
    expiresAt: null,
    isActive: true,
    usageLimit: null,
  },
  {
    code: "FREESHIP",
    discountType: "FIXED",
    discountValue: 30,
    minOrderAmount: 200,
    maxDiscount: null,
    expiresAt: null,
    isActive: true,
    usageLimit: null,
  },
];

async function main() {
  for (const f of FIXTURES) {
    const row = await prisma.promoCode.upsert({
      where: { code: f.code },
      create: f,
      update: {
        discountType: f.discountType,
        discountValue: f.discountValue,
        minOrderAmount: f.minOrderAmount,
        maxDiscount: f.maxDiscount,
        expiresAt: f.expiresAt,
        isActive: f.isActive,
        usageLimit: f.usageLimit,
      },
    });
    console.log(
      `  ✓ ${row.code.padEnd(10)} ${row.discountType.padEnd(10)} value=${row.discountValue} used=${row.usedCount}`,
    );
  }
  console.log(`Done. ${FIXTURES.length} promo codes ready.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
