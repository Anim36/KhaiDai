/* eslint-disable */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });
(async () => {
  const r = await p.riderProfile.findFirst({ where: { userId: { not: undefined } } });
  const orders = await p.order.findMany({
    where: {
      riderId: r?.userId,
      status: { in: ["OFFERED_TO_RIDER", "PICKED_UP", "ON_THE_WAY"] },
    },
    select: { id: true, status: true },
  });
  console.log("Active orders for rider:", orders.length);
  console.log(orders);
  await p.$disconnect();
})();