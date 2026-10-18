/* eslint-disable */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
(async () => {
  try {
    const o = await p.orderMessage.findMany();
    console.log("OrderMessage rows:", o.length);
  } catch (e: any) {
    console.log("OrderMessage error:", e.message);
  }
  try {
    const r = await p.review.findMany({ take: 1 });
    console.log("Review rows:", r.length);
  } catch (e: any) {
    console.log("Review error:", e.message);
  }
  await p.$disconnect();
})();