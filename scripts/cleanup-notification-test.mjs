// scripts/cleanup-notification-test.mjs — remove the test user
// created for the notification-toggle verification flow.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const deleted = await prisma.user.deleteMany({
  where: { email: "toggle-test@khaidai.test" },
});
console.log(`Removed ${deleted.count} test user(s).`);
await prisma.$disconnect();
