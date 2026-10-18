/* eslint-disable */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });
(async () => {
  const r = await p.restaurantDocument.count();
  const rid = await p.riderDocument.count();
  const pendingR = await p.restaurant.findMany({
    where: { verificationStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      verificationStatus: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  });
  const pendingRid = await p.riderProfile.findMany({
    where: { verificationStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      vehicleType: true,
      verificationStatus: true,
      _count: { select: { documents: true } },
    },
  });
  console.log("RestaurantDocument count:", r);
  console.log("RiderDocument count:", rid);
  console.log("Pending restaurants:", pendingR);
  console.log("Pending riders:", pendingRid);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
