/**
 * Temporary fixture for the SSLCommerz smoke test. Creates a known
 * customer / partner / admin triple with a known password and a
 * restaurant + menu item. Delete after verification.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PASSWORD = "Pa55word!";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  // --- customer -----------------------------------------------------
  const customer = await prisma.user.upsert({
    where: { email: "sslcz.customer@example.com" },
    update: { password: hash, deletedAt: null, isSuspended: false },
    create: {
      email: "sslcz.customer@example.com",
      name: "SSLCommerz Tester",
      phone: "+8801711000000",
      role: "CUSTOMER",
      password: hash,
    },
  });

  const existingAddr = await prisma.address.findFirst({
    where: { userId: customer.id },
  });
  if (!existingAddr) {
    await prisma.address.create({
      data: {
        userId: customer.id,
        label: "HOME",
        fullAddress: "House 9, Road 3, Banani, Dhaka 1213, Bangladesh",
        city: "Dhaka",
        area: "Banani",
        isDefault: true,
      },
    });
  }

  // --- partner + restaurant + menu ----------------------------------
  const partner = await prisma.user.upsert({
    where: { email: "sslcz.partner@example.com" },
    update: { password: hash, deletedAt: null, isSuspended: false },
    create: {
      email: "sslcz.partner@example.com",
      name: "SSLCommerz Partner",
      phone: "+8801711000001",
      role: "PARTNER",
      password: hash,
    },
  });

  let restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: partner.id },
  });
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: "SSLCommerz Test Kitchen",
        ownerId: partner.id,
        address: "House 9, Road 3, Banani, Dhaka 1213",
        cuisine: "Bangladeshi",
        rating: 4.5,
        deliveryTime: 30,
        deliveryFee: 50,
        verificationStatus: "APPROVED",
      },
    });
  }

  let menuItem = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id },
  });
  if (!menuItem) {
    menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        name: "Test Chicken",
        price: 220,
        category: "mains",
        description: "Smoke-test dish.",
        image: "/assets/dish-1.png",
        available: true,
      },
    });
  }

  // --- admin --------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: "sslcz.admin@example.com" },
    update: { password: hash, deletedAt: null, isSuspended: false },
    create: {
      email: "sslcz.admin@example.com",
      name: "SSLCommerz Admin",
      role: "ADMIN",
      password: hash,
    },
  });

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        partnerId: partner.id,
        adminId: admin.id,
        restaurantId: restaurant.id,
        menuItemId: menuItem.id,
        password: PASSWORD,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
