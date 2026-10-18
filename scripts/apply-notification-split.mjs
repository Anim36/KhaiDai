// scripts/apply-notification-split.mjs — apply the schema change
// that splits `User.notificationsEnabled` into three independent
// notification flags. Safe to re-run.
//
// Migration is a no-op if the new columns already exist.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1;`,
    table,
    column,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function exec(sql) {
  await prisma.$executeRawUnsafe(sql);
}

const adds = ["notifyOrderUpdates", "notifyPromotions", "notifyNewsletter"];

for (const col of adds) {
  if (!(await columnExists("User", col))) {
    await exec(
      `ALTER TABLE "User" ADD COLUMN "${col}" BOOLEAN NOT NULL DEFAULT true;`,
    );
    console.log(`Added "User"."${col}" with default true.`);
  } else {
    console.log(`"User"."${col}" already exists, skipping.`);
  }
}

if (await columnExists("User", "notificationsEnabled")) {
  await exec(`ALTER TABLE "User" DROP COLUMN "notificationsEnabled";`);
  console.log(`Dropped legacy "User"."notificationsEnabled".`);
} else {
  console.log(`"User"."notificationsEnabled" already absent, skipping.`);
}

await prisma.$disconnect();
