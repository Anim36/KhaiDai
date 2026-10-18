// Smoke test for ধাপ ৪ — restaurant verification status propagation.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0, failed = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); passed++; }
  else { console.log("FAIL  " + msg); failed++; }
};

try {
  // 1. All existing (non-deleted) restaurants must be APPROVED.
  const pending = await prisma.restaurant.count({
    where: { verificationStatus: "PENDING", deletedAt: null },
  });
  log(
    pending === 0,
    `no live restaurant is still PENDING after backfill (count=${pending})`,
  );

  // 2. Newly created restaurant defaults to PENDING.
  const owner = await prisma.user.findFirst({ where: { role: "PARTNER" } });
  if (!owner) throw new Error("no PARTNER user to attach test restaurant to");
  const before = Date.now();
  const probe = await prisma.restaurant.create({
    data: {
      name: `Smoke Test Restaurant ${before}`,
      ownerId: owner.id,
      address: "Test address",
      cuisine: "other",
      deliveryTime: 30,
      deliveryFee: 0,
    },
  });
  log(
    probe.verificationStatus === "PENDING",
    `newly-created restaurant defaults to PENDING (got ${probe.verificationStatus})`,
  );

  // 3. Document upload creates rows; replacing the same type
  //    drops the prior row.
  const doc1 = await prisma.restaurantDocument.create({
    data: {
      restaurantId: probe.id,
      documentType: "TRADE_LICENSE",
      fileUrl: "data:application/pdf;base64,xxx",
    },
  });
  log(!!doc1.id, "RestaurantDocument row created");

  const replaced = await prisma.$transaction(async (tx) => {
    await tx.restaurantDocument.deleteMany({
      where: { restaurantId: probe.id, documentType: "TRADE_LICENSE" },
    });
    return tx.restaurantDocument.create({
      data: {
        restaurantId: probe.id,
        documentType: "TRADE_LICENSE",
        fileUrl: "data:application/pdf;base64,yyy",
      },
    });
  });
  const count = await prisma.restaurantDocument.count({
    where: { restaurantId: probe.id, documentType: "TRADE_LICENSE" },
  });
  log(
    count === 1 && replaced.fileUrl === "data:application/pdf;base64,yyy",
    `replace-by-type keeps exactly one row (count=${count})`,
  );

  // 4. liveRestaurant() filter: PENDING restaurant excluded.
  const liveRows = await prisma.restaurant.findMany({
    where: {
      deletedAt: null,
      isSuspended: false,
      verificationStatus: "APPROVED",
    },
    select: { id: true },
  });
  const probeIsLive = liveRows.some((r) => r.id === probe.id);
  log(
    !probeIsLive,
    `PENDING restaurant hidden from customer-facing filter`,
  );

  // Cleanup.
  await prisma.restaurantDocument.deleteMany({ where: { restaurantId: probe.id } });
  await prisma.restaurant.delete({ where: { id: probe.id } });
} catch (err) {
  console.error("ERROR:", err.message);
  failed++;
} finally {
  await prisma.$disconnect();
}

console.log(`\nVERIF SMOKE: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);