import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: a });

const orders = await p.order.findMany({
  where: { status: "READY" },
  orderBy: { createdAt: "desc" },
  take: 3,
  select: {
    id: true,
    status: true,
    riderId: true,
    deliveryLat: true,
    deliveryLng: true,
    restaurantId: true,
    createdAt: true,
    restaurant: { select: { id: true, name: true, latitude: true, longitude: true } },
  },
});
console.log(JSON.stringify(orders, null, 2));

// Rider A profile
const a_user = await p.user.findUnique({ where: { email: "rider-zone-a@khaidai.test" } });
const a_profile = await p.riderProfile.findUnique({ where: { userId: a_user.id } });
console.log("Rider A profile:");
console.log(JSON.stringify(a_profile, null, 2));

// Notification table for rider A
const notifs = await p.notification.findMany({ where: { userId: a_user.id } });
console.log(`A has ${notifs.length} notifications`);

await p.$disconnect();
