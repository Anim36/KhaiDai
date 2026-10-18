// scripts/_e2e_notify_off.mjs
//
// Verifies that the notify* preferences actually gate the bell
// notification emissions:
//
//   3. notifyNewRequest=false: dispatch + offer card still works,
//      but no bell row is created.
//   4. notifyPayout=false: rider payout POST doesn't write a
//      bell notification row.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function randPhone() {
  return `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}
let passed = 0;
let failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else    { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

async function ensureUser(email, role) {
  let u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash("khaidai1234", 12);
    u = await prisma.user.create({
      data: { email, name: `${role} notify-off`, role, password: hash, phone: randPhone() },
    });
  }
  return u;
}

async function login(email, role) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "khaidai1234", expectedRole: role }),
  });
  return (await r.json()).token;
}

const RIDER_EMAIL = "rider-notify-off@khaidai.test";
const PARTNER_EMAIL = "partner-notify-off@khaidai.test";
const CUSTOMER_EMAIL = "customer-notify-off@khaidai.test";

await ensureUser(RIDER_EMAIL, "RIDER");
await ensureUser(PARTNER_EMAIL, "PARTNER");
await ensureUser(CUSTOMER_EMAIL, "CUSTOMER");

// Pin the test restaurant.
const partnerUser = await prisma.user.findUnique({ where: { email: PARTNER_EMAIL } });
let restaurant = await prisma.restaurant.findFirst({ where: { ownerId: partnerUser.id } });
if (!restaurant) {
  restaurant = await prisma.restaurant.create({
    data: {
      ownerId: partnerUser.id,
      name: "Notify-off Test Restaurant",
      address: "Mirpur 10, Dhaka",
      latitude: 23.8069, longitude: 90.3687,
      cuisine: "Bangladesh",
      deliveryTime: 30, deliveryFee: 50,
    },
  });
} else {
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { latitude: 23.8069, longitude: 90.3687 },
  });
}
let menuItem = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id } });
if (!menuItem) {
  menuItem = await prisma.menuItem.create({
    data: { restaurantId: restaurant.id, name: "Notify-off Rice Bowl", price: 250, category: "Mains", available: true },
  });
}

// Pin the rider with zone A around the restaurant.
const riderUser = await prisma.user.findUnique({ where: { email: RIDER_EMAIL } });
await prisma.riderProfile.upsert({
  where: { userId: riderUser.id },
  update: {
    zoneLat: 23.8069, zoneLng: 90.3687, zoneRadiusKm: 5, zoneAddress: "Zone A",
    currentLat: 23.8069, currentLng: 90.3687, lastLocationUpdate: new Date(),
    isOnline: true, vehicleType: "bike", vehicleRegNumber: "DHA-NO-1234",
    notifyNewRequest: false, notifyPayout: false, notifyWeeklySummary: false,
  },
  create: {
    userId: riderUser.id,
    zoneLat: 23.8069, zoneLng: 90.3687, zoneRadiusKm: 5, zoneAddress: "Zone A",
    currentLat: 23.8069, currentLng: 90.3687, lastLocationUpdate: new Date(),
    isOnline: true, vehicleType: "bike", vehicleRegNumber: "DHA-NO-1234",
    notifyNewRequest: false, notifyPayout: false, notifyWeeklySummary: false,
  },
});

const partnerToken = await login(PARTNER_EMAIL, "PARTNER");
const customerToken = await login(CUSTOMER_EMAIL, "CUSTOMER");

// ====== 3. notifyNewRequest=false: bell suppressed, offer card alive ======
await prisma.notification.deleteMany({ where: { userId: riderUser.id, title: "New delivery offer" } });

const placed = await (await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: "Notify-off Test Address",
    paymentMethod: "CASH",
    lat: 23.82, lng: 90.37,
  }),
})).json();
const orderId = placed.order?.id;

await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ status: "preparing" }),
});
await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ status: "ready" }),
});
await new Promise((r) => setTimeout(r, 1500));

const orderAfter = await prisma.order.findUnique({ where: { id: orderId } });
record("3a. dispatch still picked the rider (workflow unchanged)",
  orderAfter?.riderId === riderUser.id,
  `riderId=${orderAfter?.riderId}`);

const offerNotifs = await prisma.notification.findMany({
  where: { userId: riderUser.id, title: "New delivery offer", relatedOrderId: orderId },
});
record("3b. NO bell notification emitted when notifyNewRequest=false",
  offerNotifs.length === 0,
  `notifs=${offerNotifs.length}`);

// Cleanup
await prisma.order.update({
  where: { id: orderId },
  data: { riderId: null, status: "READY", dispatchedRiders: { riders: [] } },
});

// ====== 4. notifyPayout=false: payout status change doesn't bell ======
// Wipe stale orders + payouts so the balance calc starts clean.
await prisma.payout.deleteMany({ where: { riderProfileId: (await prisma.riderProfile.findUnique({ where: { userId: riderUser.id } })).id } });
await prisma.order.deleteMany({ where: { riderId: riderUser.id, restaurantId: restaurant.id } });

// Stage 4a — rider POSTs a withdrawal. notifyPayout=false → no bell row.
await prisma.notification.deleteMany({ where: { userId: riderUser.id, type: "ORDER_UPDATE", title: { contains: "ayout" } } });

// First add a payment account for the rider.
let account = await prisma.riderPaymentAccount.findFirst({ where: { riderProfileId: (await prisma.riderProfile.findUnique({ where: { userId: riderUser.id } }))?.id } });
const profileId = (await prisma.riderProfile.findUnique({ where: { userId: riderUser.id } }))?.id;
if (!account) {
  account = await prisma.riderPaymentAccount.create({
    data: {
      riderProfileId: profileId,
      method: "BKASH",
      destination: randPhone(),
      accountHolder: "Notify-off Rider",
      label: "bKash Personal",
      isDefault: true,
    },
  });
}

const riderToken = await login(RIDER_EMAIL, "RIDER");
// Ensure rider has a delivered order to draw balance from.
const delivered = await prisma.order.findFirst({
  where: { riderId: riderUser.id, status: "DELIVERED", riderEarning: { gt: 0 } },
});
if (!delivered) {
  // Create a delivered order so balance > 0. riderEarning
  // gets the legacy 70% fallback when null, so total needs to
  // exceed 500/0.7 = ~715. We fund 2 orders so we have enough
  // balance to issue the second payout too.
  const deliveredOrder = await prisma.order.create({
    data: {
      customerId: (await prisma.user.findUnique({ where: { email: CUSTOMER_EMAIL } }))?.id,
      restaurantId: restaurant.id,
      status: "DELIVERED",
      subtotal: 1200, deliveryFee: 800, tax: 60, total: 2060,
      riderId: riderUser.id, riderEarning: 800,
      deliveryAddress: "Past delivery 1",
      paymentMethod: "CASH",
    },
  });
  await prisma.order.create({
    data: {
      customerId: (await prisma.user.findUnique({ where: { email: CUSTOMER_EMAIL } }))?.id,
      restaurantId: restaurant.id,
      status: "DELIVERED",
      subtotal: 1200, deliveryFee: 800, tax: 60, total: 2060,
      riderId: riderUser.id, riderEarning: 800,
      deliveryAddress: "Past delivery 2",
      paymentMethod: "CASH",
    },
  });
  console.log("seeded delivered order", deliveredOrder.id);
}

const payoutRes = await fetch(`${BASE}/api/rider/payouts`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ amount: 500, paymentAccountId: account.id, note: "test" }),
});
const payoutJ = await payoutRes.json();
record("4a. rider POST /api/rider/payouts succeeds",
  payoutRes.status === 201, `status=${payoutRes.status} body=${JSON.stringify(payoutJ).slice(0, 200)}`);

const payoutNotifs = await prisma.notification.findMany({
  where: { userId: riderUser.id, relatedOrderId: null, type: "ORDER_UPDATE", title: { contains: "ayout" } },
});
record("4b. NO bell notification emitted when notifyPayout=false",
  payoutNotifs.length === 0,
  `notifs=${payoutNotifs.length}`);

// ====== 4c. Re-enable notifyPayout and POST again — bell SHOULD fire ======
await prisma.riderProfile.update({
  where: { userId: riderUser.id },
  data: { notifyPayout: true },
});
await prisma.notification.deleteMany({ where: { userId: riderUser.id, title: { contains: "ayout" } } });

const payout2 = await fetch(`${BASE}/api/rider/payouts`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ amount: 500, paymentAccountId: account.id, note: "test 2" }),
});
const payout2J = await payout2.json();
record("4c. notifyPayout=true: rider POST /api/rider/payouts succeeds",
  payout2.status === 201, `status=${payout2.status} body=${JSON.stringify(payout2J).slice(0, 200)}`);

const payout2Notifs = await prisma.notification.findMany({
  where: { userId: riderUser.id, title: { contains: "ayout" } },
});
record("4d. notifyPayout=true: bell notification IS emitted",
  payout2Notifs.length >= 1,
  `notifs=${payout2Notifs.length}`);

await prisma.$disconnect();
console.log(`\n==== Notify-off behaviour: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
