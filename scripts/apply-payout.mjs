// scripts/apply-payout.mjs — creates PayoutMethod + PayoutStatus
// enums and the Payout table on the live DB. Safe to re-run.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function typeExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM pg_type WHERE typname = $1 LIMIT 1;`,
    name,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1;`,
    name,
  );
  return Array.isArray(rows) && rows.length > 0;
}

if (!(await typeExists("PayoutMethod"))) {
  await prisma.$executeRawUnsafe(
    `CREATE TYPE "PayoutMethod" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'CARD');`,
  );
  console.log("Created enum PayoutMethod");
} else {
  console.log("Enum PayoutMethod already exists, skipping");
}

if (!(await typeExists("PayoutStatus"))) {
  await prisma.$executeRawUnsafe(
    `CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');`,
  );
  console.log("Created enum PayoutStatus");
} else {
  console.log("Enum PayoutStatus already exists, skipping");
}

if (!(await tableExists("Payout"))) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Payout" (
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
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX "Payout_restaurantId_idx" ON "Payout" ("restaurantId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX "Payout_status_idx" ON "Payout" ("status");`,
  );
  console.log("Created Payout table");
} else {
  console.log("Payout table already exists, skipping");
}

await prisma.$disconnect();
