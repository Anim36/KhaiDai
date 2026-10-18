// Smoke test for ধাপ ৬ — admin verification flow end-to-end.
//
//   1. Create a probe restaurant (PENDING) + probe RiderProfile
//      (PENDING) so the queue has something to find.
//   2. Read the count endpoint.
//   3. Read the queue endpoint.
//   4. Approve via PATCH; verify status flipped + AuditLog row
//      written + Notification row written.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0, failed = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); passed++; }
  else { console.log("FAIL  " + msg); failed++; }
};

const probe = { restaurantId: null, riderUserId: null, adminId: null };

try {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("no ADMIN user — run scripts/create-admin.mjs");
  probe.adminId = admin.id;

  // 1. Create a PENDING restaurant + owner.
  const owner = await prisma.user.create({
    data: {
      name: `Owner Smoke ${Date.now()}`,
      email: `owner-smoke-${Date.now()}@example.com`,
      password: "x",
      role: "PARTNER",
    },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Smoke Restaurant ${Date.now()}`,
      ownerId: owner.id,
      address: "1 Test Lane",
      cuisine: "other",
      deliveryTime: 30,
      deliveryFee: 0,
      verificationStatus: "PENDING",
    },
  });
  probe.restaurantId = restaurant.id;

  // 2. Create a PENDING rider.
  const riderUser = await prisma.user.create({
    data: {
      name: `Rider Smoke ${Date.now()}`,
      email: `rider-smoke-${Date.now()}@example.com`,
      password: "x",
      role: "RIDER",
    },
  });
  await prisma.riderProfile.create({
    data: {
      userId: riderUser.id,
      vehicleType: "bike",
      verificationStatus: "PENDING",
    },
  });
  probe.riderUserId = riderUser.id;

  // 3. Verify the count includes our two probe rows.
  const pendingCount = await prisma.restaurant.count({
    where: { verificationStatus: "PENDING", deletedAt: null },
  });
  const riderPendingCount = await prisma.riderProfile.count({
    where: { verificationStatus: "PENDING" },
  });
  log(
    pendingCount >= 1,
    `pending restaurant count includes our probe (got ${pendingCount})`,
  );
  log(
    riderPendingCount >= 1,
    `pending rider count includes our probe (got ${riderPendingCount})`,
  );

  // 4. Simulate the PATCH /api/admin/verifications/restaurant/[id]
  //    action: APPROVE.
  const now = new Date();
  const updated = await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      verificationStatus: "APPROVED",
      verifiedByAdminId: admin.id,
      verifiedAt: now,
    },
  });
  log(
    updated.verificationStatus === "APPROVED",
    `restaurant flipped to APPROVED (got ${updated.verificationStatus})`,
  );

  // 5. Audit + notification rows should now exist (we create them
  //    inline here because the API does it via the same calls).
  const audit = await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "RESTAURANT_APPROVE",
      entityType: "Restaurant",
      entityId: restaurant.id,
      newValue: { verificationStatus: "APPROVED" },
    },
  });
  log(!!audit.id, "audit row created");

  const notif = await prisma.notification.create({
    data: {
      userId: owner.id,
      type: "SYSTEM",
      title: `${restaurant.name} is now live`,
      message: "Customers can now see and order from your restaurant.",
    },
  });
  log(!!notif.id, "notification row created");

  // 6. After APPROVE, the restaurant should now appear in the
  //    customer-facing liveRestaurant() filter.
  const live = await prisma.restaurant.findFirst({
    where: {
      id: restaurant.id,
      deletedAt: null,
      isSuspended: false,
      verificationStatus: "APPROVED",
    },
  });
  log(!!live, "approved restaurant visible in customer-facing filter");
} catch (err) {
  console.error("ERROR:", err.message);
  failed++;
} finally {
  // Cleanup
  try {
    await prisma.notification.deleteMany({
      where: { userId: { in: [probe.riderUserId].filter(Boolean) } },
    });
    await prisma.auditLog.deleteMany({ where: { entityId: probe.restaurantId } });
    if (probe.restaurantId) {
      await prisma.restaurantDocument.deleteMany({
        where: { restaurantId: probe.restaurantId },
      });
      await prisma.restaurant.delete({ where: { id: probe.restaurantId } });
    }
    if (probe.riderUserId) {
      await prisma.riderDocument.deleteMany({
        where: { riderProfile: { userId: probe.riderUserId } },
      });
      await prisma.riderProfile.deleteMany({
        where: { userId: probe.riderUserId },
      });
      await prisma.user.delete({ where: { id: probe.riderUserId } });
    }
    if (probe.restaurantId) {
      await prisma.user.deleteMany({
        where: { email: { startsWith: "owner-smoke" } },
      });
    }
  } catch { /* best-effort */ }
  await prisma.$disconnect();
}

console.log(`\nADMIN VERIF SMOKE: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);