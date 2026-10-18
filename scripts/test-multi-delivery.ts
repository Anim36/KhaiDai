/* eslint-disable */
// Verify Feat 1 — a rider can accept up to MAX_CONCURRENT_DELIVERIES
// (= 3) active orders; a 4th dispatch attempt must skip them.
//
// Strategy:
//   1. Create an APPROVED rider (skip verification for test).
//   2. Bootstrap three Restaurant + three orders, each in a
//      PICKED_UP state, all assigned to the same rider.
//   3. Run dispatch for a 4th order — the rider must NOT be picked.
//   4. Mark one of the three as DELIVERED; re-run dispatch — rider
//      should now be eligible again.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  MAX_CONCURRENT_DELIVERIES,
  pickNextRider,
} from "../lib/dispatch";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });

(async () => {
  console.log("MAX_CONCURRENT_DELIVERIES =", MAX_CONCURRENT_DELIVERIES);

  // Find a restaurant that has coordinates set.
  const restaurant = await p.restaurant.findFirst({
    where: { latitude: { not: null }, longitude: { not: null } },
    include: { owner: true },
  });
  if (!restaurant || !restaurant.latitude || !restaurant.longitude) {
    console.log("No restaurant with coordinates — skipping");
    process.exit(0);
  }
  const rider = await p.user.findFirst({
    where: { role: "RIDER" },
    include: { riderProfile: true },
  });
  if (!rider?.riderProfile) {
    console.log("No rider profile — skipping");
    process.exit(0);
  }

  // Set rider location to near the restaurant + mark online + APPROVED.
  await p.riderProfile.update({
    where: { userId: rider.id },
    data: {
      currentLat: restaurant.latitude,
      currentLng: restaurant.longitude,
      lastLocationUpdate: new Date(),
      isOnline: true,
      verificationStatus: "APPROVED",
      zoneLat: restaurant.latitude,
      zoneLng: restaurant.longitude,
      zoneRadiusKm: 50,
    },
  });

  // Build a customer + 3 orders.
  const customer = await p.user.create({
    data: {
      email: `test-customer.${Date.now()}@example.com`,
      name: "Test Customer",
      password: "x",
      role: "CUSTOMER",
      customerProfile: { create: {} },
    },
  });

  // Clean up any leftovers from prior runs.
  await p.order.deleteMany({
    where: { restaurantId: restaurant.id, customerId: customer.id },
  });
  // Also clear any unrelated active orders on this rider from prior
  // test runs so we measure the dispatch rule on a clean slate.
  await p.order.updateMany({
    where: {
      riderId: rider.id,
      status: { in: ["OFFERED_TO_RIDER", "PICKED_UP", "ON_THE_WAY"] },
    },
    data: { status: "DELIVERED" },
  });

  const orderIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const o = await p.order.create({
      data: {
        restaurantId: restaurant.id,
        customerId: customer.id,
        riderId: rider.id,
        status: "PICKED_UP",
        subtotal: 100,
        deliveryFee: 50,
        total: 150,
        riderEarning: 12,
        deliveryAddress: "Test addr",
        paymentMethod: "CASH",
      },
    });
    orderIds.push(o.id);
  }
  console.log("Created 3 active orders, all PICKED_UP, assigned to rider");

  // Attempt to dispatch a 4th order — the rider must be skipped.
  const coords = { lat: restaurant.latitude, lng: restaurant.longitude };
  const pick1 = await pickNextRider(coords.lat, coords.lng, []);
  console.log("Dispatch (3 active): riderId =", pick1.riderId, "(should be null)");
  if (pick1.riderId === rider.id) {
    console.log("FAIL — rider should not be eligible with 3 active orders");
    process.exit(1);
  }

  // Mark one as DELIVERED — rider should be eligible again.
  await p.order.update({
    where: { id: orderIds[0] },
    data: { status: "DELIVERED" },
  });
  const pick2 = await pickNextRider(coords.lat, coords.lng, []);
  console.log("Dispatch (2 active): riderId =", pick2.riderId, "(should be", rider.id, ")");
  if (pick2.riderId !== rider.id) {
    console.log("FAIL — rider should be eligible with 2 active orders");
    process.exit(1);
  }

  console.log("\n✅ Feat 1 verified: rider capped at 3 concurrent, becomes eligible again after a delivery completes.");

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});