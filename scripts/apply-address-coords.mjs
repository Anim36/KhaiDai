// scripts/apply-address-coords.mjs — add latitude/longitude to
// the Address table. Safe to re-run.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1;`,
    table,
    column,
  );
  return Array.isArray(rows) && rows.length > 0;
}

const adds = [
  ["latitude", "DOUBLE PRECISION"],
  ["longitude", "DOUBLE PRECISION"],
];

for (const [col, type] of adds) {
  if (!(await columnExists("Address", col))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Address" ADD COLUMN "${col}" ${type};`,
    );
    console.log(`Added "Address"."${col}" (${type}).`);
  } else {
    console.log(`"Address"."${col}" already exists, skipping.`);
  }
}

await prisma.$disconnect();
