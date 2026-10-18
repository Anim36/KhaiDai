import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const restaurants = await prisma.restaurant.findMany({
  select: {
    id: true,
    name: true,
    ownerId: true,
    latitude: true,
    longitude: true,
    _count: { select: { menu: true } },
  },
});
console.log(JSON.stringify(restaurants, null, 2));
await prisma.$disconnect();
