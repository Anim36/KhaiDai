import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const u = await prisma.user.findFirst({
  where: { role: "ADMIN" },
  select: { email: true, name: true, isSuspended: true },
});
console.log(JSON.stringify(u, null, 2));
await prisma.$disconnect();
