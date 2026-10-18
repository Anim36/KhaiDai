/**
 * Temporary probe used during the SSLCommerz smoke test to discover
 * live rows (a customer with an address, a partner with a menu).
 * Not part of the app — delete after verification.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const users = await p.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, name: true, role: true, phone: true },
  });
  console.log("USERS", JSON.stringify(users, null, 1));

  const restaurants = await p.restaurant.findMany({
    select: { id: true, name: true, ownerId: true },
  });
  console.log("RESTAURANTS", JSON.stringify(restaurants, null, 1));

  const addrs = await p.address.findMany({
    select: { id: true, userId: true, fullAddress: true, isDefault: true },
    take: 5,
  });
  console.log("ADDRESSES", JSON.stringify(addrs, null, 1));

  const menu = await p.menuItem.findMany({
    select: { id: true, name: true, restaurantId: true, price: true },
    take: 5,
  });
  console.log("MENU", JSON.stringify(menu, null, 1));
}

main()
  .then(() => p.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await p.$disconnect();
    process.exit(1);
  });
