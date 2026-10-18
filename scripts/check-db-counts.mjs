// scripts/check-db-counts.mjs — quick row counts for sanity
// checking the database before exercising the trending endpoint.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const counts = {
  restaurants: await prisma.restaurant.count(),
  menuItems: await prisma.menuItem.count(),
  availableMenuItems: await prisma.menuItem.count({ where: { available: true } }),
  orders: await prisma.order.count(),
  deliveredOrders: await prisma.order.count({ where: { status: "DELIVERED" } }),
  orderItems: await prisma.orderItem.count(),
};

console.log(JSON.stringify(counts, null, 2));
await prisma.$disconnect();
