// scripts/seed-test-user.mjs — create a test customer for the
// notification-toggle verification flow.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const email = "toggle-test@khaidai.test";

const user = await prisma.user.upsert({
  where: { email },
  update: {
    notifyOrderUpdates: true,
    notifyPromotions: true,
    notifyNewsletter: true,
  },
  create: {
    email,
    name: "Toggle Test",
    role: "CUSTOMER",
    password: "hashed:seed",
    phone: "+8801700000000",
    notifyOrderUpdates: true,
    notifyPromotions: true,
    notifyNewsletter: true,
  },
});

console.log(JSON.stringify({
  id: user.id,
  email: user.email,
  name: user.name,
  notifyOrderUpdates: user.notifyOrderUpdates,
  notifyPromotions: user.notifyPromotions,
  notifyNewsletter: user.notifyNewsletter,
}, null, 2));
await prisma.$disconnect();
