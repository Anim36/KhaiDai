// Restore users (and other related rows) from the oldest backup,
// which captured the DB state with 128 users. The other rows that
// don't have a clean re-insert path (sessions, online flags,
// timestamps that may conflict) are skipped; we only restore the
// critical customer/partner/rider/admin records and their
// dependent profile rows.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const data = JSON.parse(
  readFileSync("D:/KhaiDai/khaidai/.backups/20260930_152828/db.json", "utf8"),
);

console.log("Restoring from 20260930_152828 dump...");
console.log("  users:", data.user.length);
console.log("  restaurants:", data.restaurant.length);
console.log("  menuItems:", data.menuItem.length);
console.log("  orders:", data.order.length);
console.log("  orderItems:", data.orderItem.length);
console.log("  addresses:", data.address.length);
console.log("  riderProfiles:", data.riderProfile.length);

// Restore users.
let restoredUsers = 0;
for (const u of data.user) {
  try {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        phone: u.phone,
        role: u.role,
        createdAt: new Date(u.createdAt),
        deletedAt: u.deletedAt ? new Date(u.deletedAt) : null,
        isSuspended: u.isSuspended ?? false,
        notifyOrderUpdates: u.notifyOrderUpdates ?? true,
        notifyPromotions: u.notifyPromotions ?? true,
        notifyNewsletter: u.notifyNewsletter ?? true,
      },
    });
    restoredUsers++;
  } catch (err) {
    console.warn(`  skip user ${u.id} (${u.email}): ${err.code}`);
  }
}
console.log(`Restored ${restoredUsers}/${data.user.length} users`);

// Restore customer profiles.
let restoredCustomers = 0;
for (const p of data.user.filter((u) => u.role === "CUSTOMER")) {
  try {
    await prisma.customerProfile.create({ data: { userId: p.id } });
    restoredCustomers++;
  } catch { /* may already exist */ }
}
console.log(`Restored ${restoredCustomers} customer profiles`);

// Restore partner profiles.
let restoredPartners = 0;
for (const p of data.user.filter((u) => u.role === "PARTNER")) {
  try {
    await prisma.partnerProfile.create({ data: { userId: p.id } });
    restoredPartners++;
  } catch { /* may already exist */ }
}
console.log(`Restored ${restoredPartners} partner profiles`);

// Restore rider profiles.
let restoredRiders = 0;
for (const p of data.riderProfile) {
  try {
    await prisma.riderProfile.create({
      data: {
        id: p.id,
        userId: p.userId,
        vehicleType: p.vehicleType,
        vehicleRegNumber: p.vehicleRegNumber,
        currentLat: p.currentLat,
        currentLng: p.currentLng,
        lastLocationUpdate: p.lastLocationUpdate
          ? new Date(p.lastLocationUpdate)
          : null,
        isOnline: p.isOnline,
        zoneLat: p.zoneLat,
        zoneLng: p.zoneLng,
        zoneRadiusKm: p.zoneRadiusKm,
        zoneAddress: p.zoneAddress,
        notifyNewRequest: p.notifyNewRequest,
        notifyPayout: p.notifyPayout,
        notifyWeeklySummary: p.notifyWeeklySummary,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      },
    });
    restoredRiders++;
  } catch (err) {
    console.warn(`  skip rider ${p.id}: ${err.code}`);
  }
}
console.log(`Restored ${restoredRiders}/${data.riderProfile.length} rider profiles`);

// Restore addresses.
let restoredAddresses = 0;
for (const a of data.address) {
  try {
    await prisma.address.create({
      data: {
        id: a.id,
        userId: a.userId,
        label: a.label,
        street: a.street,
        city: a.city,
        zip: a.zip,
        latitude: a.latitude,
        longitude: a.longitude,
        isDefault: a.isDefault,
        createdAt: new Date(a.createdAt),
      },
    });
    restoredAddresses++;
  } catch (err) {
    console.warn(`  skip address ${a.id}: ${err.code}`);
  }
}
console.log(`Restored ${restoredAddresses}/${data.address.length} addresses`);

await prisma.$disconnect();
console.log("Done.");