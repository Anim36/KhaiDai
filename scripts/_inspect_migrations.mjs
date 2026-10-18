// scripts/_inspect_migrations.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const rows = await prisma.$queryRawUnsafe(
  `SELECT id, migration_name, checksum, started_at, finished_at, applied_steps_count
   FROM "_prisma_migrations"
   WHERE migration_name LIKE '%restructure%'
   ORDER BY started_at DESC`
);
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
