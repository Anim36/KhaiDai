// scripts/list-admins.mjs — find a usable admin login for e2e
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });
const admins = await p.user.findMany({
  where: { role: "ADMIN" },
  select: { id: true, email: true, name: true },
  take: 5,
});
console.log(JSON.stringify(admins, null, 2));
await p.$disconnect();
