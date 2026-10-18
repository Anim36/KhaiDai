// End-to-end: place an order, walk it through PENDING -> PREPARING ->
// READY -> DELIVERED, then check the Customer's /api/orders list
// returns the right status + the right restaurant + item name.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function randPhone() {
  return `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}
let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

async function ensureUser(email, role, name) {
  let u = await prisma.user.findUnique({ where: { email } });
  if (!u) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash("khaidai1234", 12);
    u = await prisma.user.create({
      data: { email, name: name ?? `${role} e2e`, role, password: hash, phone: randPhone() },
    });
  }
  if (role === "RIDER") {
    await prisma.riderProfile.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id },
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
  const j = await r.json();
  if (!j.token) throw new Error("login failed: " + JSON.stringify(j));
  return j.token;
}

const CUST_EMAIL = "customer-history-e2e@khaidai.test";
const PART_EMAIL = "partner-history-e2e@khaidai.test";
const RIDER_EMAIL = "rider-history-e2e@khaidai.test";

await ensureUser(CUST_EMAIL, "CUSTOMER", "History E2E Customer");
await ensureUser(PART_EMAIL, "PARTNER", "History E2E Partner");
await ensureUser(RIDER_EMAIL, "RIDER", "History E2E Rider");

const partner = await prisma.user.findUnique({ where: { email: PART_EMAIL } });

// Create a known restaurant + menu item with a unique name.
const REST_NAME = `History E2E Resto ${Date.now()}`;
const ITEM_NAME = `History E2E Dish ${Date.now()}`;
let restaurant = await prisma.restaurant.create({
  data: {
    ownerId: partner.id,
    name: REST_NAME,
    address: "Test Address, Dhaka",
    latitude: 23.8103, longitude: 90.4125,
    cuisine: "Test",
    deliveryTime: 30, deliveryFee: 50,
  },
});
const menuItem = await prisma.menuItem.create({
  data: {
    restaurantId: restaurant.id,
    name: ITEM_NAME,
    price: 250,
    category: "Mains",
    available: true,
  },
});
console.log(`Created restaurant "${REST_NAME}" and item "${ITEM_NAME}"`);

// Rider + zone so dispatch can fire
const rider = await prisma.user.findUnique({ where: { email: RIDER_EMAIL } });
await prisma.riderProfile.update({
  where: { userId: rider.id },
  data: {
    zoneLat: 23.8103, zoneLng: 90.4125, zoneRadiusKm: 5, zoneAddress: "Zone",
    currentLat: 23.8103, currentLng: 90.4125, lastLocationUpdate: new Date(),
    isOnline: true, vehicleType: "bike", vehicleRegNumber: "DHA-HE-0001",
  },
});

const custToken = await login(CUST_EMAIL, "CUSTOMER");
const partToken = await login(PART_EMAIL, "PARTNER");
const riderToken = await login(RIDER_EMAIL, "RIDER");

// Place an order.
const placed = await (await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${custToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 2 }],
    deliveryAddress: "Test Delivery Address",
    paymentMethod: "CASH",
    lat: 23.82, lng: 90.41,
  }),
})).json();
const orderId = placed.order?.id;
record("1a. Place order → 201 with orderId",
  Boolean(orderId), `placed=${JSON.stringify(placed).slice(0, 200)}`);

if (!orderId) {
  await prisma.$disconnect();
  process.exit(1);
}

async function fetchCustomerOrders() {
  const r = await fetch(`${BASE}/api/orders`, {
    headers: { authorization: `Bearer ${custToken}` },
  });
  return (await r.json()).orders ?? [];
}

async function expectStatus(name, expected, transform) {
  const all = await fetchCustomerOrders();
  const o = all.find((x) => x.id === orderId);
  if (!o) {
    record(name, false, `order ${orderId.slice(-6)} missing`);
    return null;
  }
  const ok = expected
    ? transform
      ? transform(o.status, o) === expected
      : o.status === expected
    : true;
  record(name, ok, `status=${o.status} rest=${o.restaurant?.name} item=${o.items?.[0]?.name}`);
  return o;
}

// Initial: PENDING
await expectStatus("1b. Customer sees PENDING after place", "pending");
record("1c. Customer sees correct restaurant.name",
  (await fetchCustomerOrders()).find((x) => x.id === orderId)?.restaurant?.name === REST_NAME,
  `actual=${(await fetchCustomerOrders()).find((x) => x.id === orderId)?.restaurant?.name} expected=${REST_NAME}`);
record("1d. Customer sees correct item.name",
  (await fetchCustomerOrders()).find((x) => x.id === orderId)?.items?.[0]?.name === ITEM_NAME,
  `actual=${(await fetchCustomerOrders()).find((x) => x.id === orderId)?.items?.[0]?.name} expected=${ITEM_NAME}`);

// Move to PREPARING.
await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partToken}` },
  body: JSON.stringify({ status: "preparing" }),
});
await expectStatus("1e. Customer sees PREPARING after partner PATCH", "preparing");

// Move to READY.
await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partToken}` },
  body: JSON.stringify({ status: "ready" }),
});
await expectStatus("1f. Customer sees READY after partner PATCH", "ready");

await new Promise((r) => setTimeout(r, 1500));

const all2 = await fetchCustomerOrders();
const found2 = all2.find((x) => x.id === orderId);
record("1g. After READY, the order is assigned to a rider (dispatch fired)",
  found2?.rider?.id === rider.id,
  `riderId=${found2?.rider?.id} expected=${rider.id}`);

// Rider picks up + delivers.
await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ status: "picked_up" }),
});
await expectStatus("1h. Customer sees PICKED_UP", "picked_up");

await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ status: "on_the_way" }),
});
await expectStatus("1i. Customer sees ON_THE_WAY", "on_the_way");

await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ status: "delivered" }),
});
await expectStatus("1j. Customer sees DELIVERED", "delivered");

// Also test the case where multiple orders are listed — only the
// one we just placed should be DELIVERED.
const allFinal = await fetchCustomerOrders();
const my = allFinal.find((x) => x.id === orderId);
record("1k. statusLabel === 'Delivered' (capital D)",
  my?.statusLabel === "Delivered", `statusLabel=${my?.statusLabel}`);

await prisma.$disconnect();
console.log(`\n==== History status e2e: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
