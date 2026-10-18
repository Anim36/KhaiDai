// scripts/seed-trending.mjs — seed the database with a partner,
// restaurant, menu items, a customer, an address, and a few
// DELIVERED orders so the trending endpoint has real data to
// surface.
//
// Safe to re-run: re-execution upserts on the same email/name
// identifiers so the leaderboard keeps incrementing instead of
// growing forever.

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function upsertUser(email, name, role, password = "hashed:seed") {
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { email, name, role, password },
  });
}

async function main() {
  // --- Users ---
  const partner = await upsertUser(
    "seed-partner@khaidai.test",
    "Seed Partner",
    "PARTNER",
  );
  const customer = await upsertUser(
    "seed-customer@khaidai.test",
    "Seed Customer",
    "CUSTOMER",
  );

  // --- Restaurant owned by the partner ---
  const restaurant = await prisma.restaurant.upsert({
    where: { id: "seed-restaurant-1" },
    update: { name: "Seed Bistro" },
    create: {
      id: "seed-restaurant-1",
      name: "Seed Bistro",
      ownerId: partner.id,
      address: "1 Seed Street, Dhaka",
      cuisine: "Bengali",
      deliveryTime: 30,
      deliveryFee: 40,
      coverImage: "/assets/rest-1.png",
    },
  });

  // --- Menu items ---
  const items = [
    { id: "seed-item-kacchi", name: "Kacchi Biryani", price: 320, category: "Biryani", popular: true, image: "/assets/dish-1.png" },
    { id: "seed-item-burger", name: "Classic Smash Burger", price: 280, category: "Burgers", popular: true, image: "/assets/dish-3.png" },
    { id: "seed-item-pizza", name: "Margherita Pizza", price: 450, category: "Pizza", popular: false, image: "/assets/dish-2.png" },
  ];
  for (const item of items) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: { ...item, restaurantId: restaurant.id, available: true },
      create: { ...item, restaurantId: restaurant.id, available: true },
    });
  }

  // --- Customer address ---
  await prisma.address.upsert({
    where: { id: "seed-address-1" },
    update: {},
    create: {
      id: "seed-address-1",
      userId: customer.id,
      label: "HOME",
      fullAddress: "House 1, Road 1, Dhaka",
      city: "Dhaka",
      area: "Dhanmondi",
      isDefault: true,
    },
  });

  // --- Orders ---
  // Build DELIVERED orders with deliberately uneven quantities so
  // the trending endpoint surfaces them in a known order:
  //   • kacchi  — 6 (top of the leaderboard)
  //   • burger  — 3
  //   • pizza   — 1 (lowest of the three)
  const targets = [
    { menuItemId: "seed-item-kacchi", qty: 6 },
    { menuItemId: "seed-item-burger", qty: 3 },
    { menuItemId: "seed-item-pizza", qty: 1 },
  ];

  for (const t of targets) {
    const orderId = `seed-order-${t.menuItemId}`;
    await prisma.order.upsert({
      where: { id: orderId },
      update: { status: "DELIVERED" },
      create: {
        id: orderId,
        customerId: customer.id,
        restaurantId: restaurant.id,
        status: "DELIVERED",
        subtotal: 100,
        deliveryFee: 40,
        tax: 0,
        total: 140,
        deliveryAddress: "House 1, Road 1, Dhaka",
        paymentMethod: "CASH",
        items: {
          create: [
            { menuItemId: t.menuItemId, quantity: t.qty, price: 100 },
          ],
        },
      },
    });
  }

  // --- Sanity readout ---
  const grouped = await prisma.orderItem.groupBy({
    by: ["menuItemId"],
    where: { order: { status: "DELIVERED" } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
  });

  console.log("Seed complete. Trending aggregation:");
  for (const g of grouped) {
    const it = await prisma.menuItem.findUnique({
      where: { id: g.menuItemId },
      include: { restaurant: { select: { name: true } } },
    });
    console.log(
      `  ${g._sum.quantity}× ${it?.name} (${it?.restaurant.name})`,
    );
  }
}

main()
  .catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Prisma error:", e.code, e.message);
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
