/* eslint-disable */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
(async () => {
  const o = await p.order.findMany({
    where: { status: { in: ["OFFERED_TO_RIDER", "PICKED_UP", "ON_THE_WAY"] } },
    select: { id: true, status: true, riderId: true },
  });
  console.log("All active orders:", o.length);
  console.log(o.slice(0, 10));
  await p.$disconnect();
})();