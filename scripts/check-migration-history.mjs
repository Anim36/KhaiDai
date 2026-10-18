// scripts/check-migration-history.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const rows = await prisma.$queryRawUnsafe('SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 20;');
console.log(rows);
await prisma.$disconnect();
