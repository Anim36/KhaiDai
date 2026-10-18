import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    name: true,
    role: true,
    riderProfile: {
      select: {
        id: true,
        currentLat: true,
        currentLng: true,
        isOnline: true,
      },
    },
    partnerProfile: {
      select: { id: true, restaurants: { select: { id: true, name: true } } },
    },
  },
  orderBy: [{ role: "asc" }, { email: "asc" }],
});
console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();
