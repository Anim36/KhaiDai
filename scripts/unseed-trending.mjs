// scripts/unseed-trending.mjs — undo the trending seed. Only
// touches the seed ids so we don't disturb real data.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const seedItemIds = ["seed-item-kacchi", "seed-item-burger", "seed-item-pizza"];
const seedOrderIds = [
  "seed-order-seed-item-kacchi",
  "seed-order-seed-item-burger",
  "seed-order-seed-item-pizza",
];

await prisma.orderItem.deleteMany({ where: { menuItemId: { in: seedItemIds } } });
await prisma.order.deleteMany({ where: { id: { in: seedOrderIds } } });
await prisma.menuItem.deleteMany({ where: { id: { in: seedItemIds } } });
await prisma.address.deleteMany({ where: { id: "seed-address-1" } });
await prisma.restaurant.deleteMany({ where: { id: "seed-restaurant-1" } });
await prisma.user.deleteMany({
  where: { email: { in: ["seed-partner@khaidai.test", "seed-customer@khaidai.test"] } },
});
console.log("Seed rows removed.");
await prisma.$disconnect();
