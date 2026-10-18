// scripts/seed-delivery-config.mjs
// Idempotent seed for the platform-wide DeliveryFeeConfig + a
// best-effort backfill of `Order.riderEarning` for orders that
// pre-date the rider-earning migration.
//
// Run with:  node scripts/seed-delivery-config.mjs
//
// Safe to run multiple times — it only inserts the config row if
// none exists and only fills riderEarning where it's currently
// null.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT = {
  baseFee: 30,
  includedKm: 1.0,
  perKmRate: 10,
  minFee: 30,
  maxFee: 250,
  riderSharePercent: 70,
};

async function seedConfig() {
  const existing = await prisma.deliveryFeeConfig.findFirst({
    where: { isActive: true },
  });
  if (existing) {
    console.log(`Config already exists (id=${existing.id}); leaving as-is.`);
    return;
  }
  await prisma.deliveryFeeConfig.create({
    data: {
      ...DEFAULT,
      isActive: true,
      // Leave updatedByUserId null — system-seeded.
    },
  });
  console.log("Created default DeliveryFeeConfig row.");
}

async function backfillRiderEarning() {
  // Backfill only rows that still have a null riderEarning AND
  // have a non-null deliveryFee (the only ones affected by the
  // legacy 0.7-share formula). Cap each iteration so a huge
  // table doesn't lock.
  let updated = 0;
  while (true) {
    const rows = await prisma.order.findMany({
      where: { riderEarning: null, deliveryFee: { gt: 0 } },
      take: 200,
      select: { id: true, deliveryFee: true },
    });
    if (rows.length === 0) break;
    await prisma.$transaction(
      rows.map((r) =>
        prisma.order.update({
          where: { id: r.id },
          data: { riderEarning: Math.round(r.deliveryFee * 0.7) },
        }),
      ),
    );
    updated += rows.length;
  }
  console.log(`Backfilled riderEarning on ${updated} order rows.`);
}

async function main() {
  await seedConfig();
  await backfillRiderEarning();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
