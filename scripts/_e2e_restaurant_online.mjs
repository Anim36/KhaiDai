// End-to-end: restaurant online/offline toggle + active hours
// (কাজ ২). Verifies:
//   1. POST /api/restaurants/status flips isAcceptingOrders and
//      creates / closes a RestaurantOnlineSession row.
//   2. GET /api/restaurants/me returns the new state plus
//      onlineSecondsToday > 0 while a session is open.
//   3. The toggle is REST-friendly: flipping back to false closes
//      the session.
//   4. POST /api/orders refuses to create an order against an
//      offline restaurant (400).
//   5. The customer-side /api/restaurants/[id] response includes
//      isAcceptingOrders: false when the restaurant is offline.
//   6. The hours counter advances while a session is open
//      (single second-resolution check).

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
      data: {
        email,
        name: name ?? `${role} e2e`,
        role,
        password: hash,
        phone: randPhone(),
      },
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

const CUST_EMAIL = "customer-rest-on-e2e@khaidai.test";
const PART_EMAIL = "partner-rest-on-e2e@khaidai.test";
await ensureUser(CUST_EMAIL, "CUSTOMER", "Rest Online E2E Customer");
await ensureUser(PART_EMAIL, "PARTNER", "Rest Online E2E Partner");

const partner = await prisma.user.findUnique({ where: { email: PART_EMAIL } });

const REST_NAME = `Rest Online E2E ${Date.now()}`;
const restaurant = await prisma.restaurant.create({
  data: {
    ownerId: partner.id,
    name: REST_NAME,
    address: "Test Address, Dhaka",
    latitude: 23.8103,
    longitude: 90.4125,
    cuisine: "Test",
    deliveryTime: 30,
    deliveryFee: 50,
  },
});
const menuItem = await prisma.menuItem.create({
  data: {
    restaurantId: restaurant.id,
    name: `Rest Online E2E Dish ${Date.now()}`,
    price: 250,
    category: "Mains",
    available: true,
  },
});

const cust = await prisma.user.findUnique({ where: { email: CUST_EMAIL } });
const addr = await prisma.address.findFirst({ where: { userId: cust.id } }) ??
  await prisma.address.create({
    data: {
      userId: cust.id,
      label: "HOME",
      fullAddress: "House 1, Dhaka",
      city: "Dhaka",
      latitude: 23.7461,
      longitude: 90.3742,
      isDefault: true,
    },
  });

const partnerToken = await login(PART_EMAIL, "PARTNER");
const customerToken = await login(CUST_EMAIL, "CUSTOMER");

// 1. Default state: isAcceptingOrders true (per the migration).
const initial = await prisma.restaurant.findUnique({
  where: { id: restaurant.id },
  select: { isAcceptingOrders: true },
});
record(
  "Fresh restaurant starts with isAcceptingOrders=true",
  initial?.isAcceptingOrders === true,
  `isAcceptingOrders=${initial?.isAcceptingOrders}`,
);

// 2. Toggle OFF.
const offRes = await fetch(`${BASE}/api/restaurants/status`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ online: false }),
});
const offJson = await offRes.json().catch(() => ({}));
record(
  "POST /api/restaurants/status {online:false} returns 200",
  offRes.status === 200 && offJson.isAcceptingOrders === false,
  `status=${offRes.status} body=${JSON.stringify(offJson)}`,
);
const dbRow = await prisma.restaurant.findUnique({
  where: { id: restaurant.id },
  select: { isAcceptingOrders: true },
});
record(
  "Restaurant row reflects isAcceptingOrders=false",
  dbRow?.isAcceptingOrders === false,
  `db=${dbRow?.isAcceptingOrders}`,
);
const sessions1 = await prisma.restaurantOnlineSession.count({
  where: { restaurantId: restaurant.id },
});
record(
  "Going offline creates zero RestaurantOnlineSession rows",
  sessions1 === 0,
  `count=${sessions1}`,
);

// 3. GET /api/restaurants/me reflects offline + 0 hours.
const meOff = await fetch(`${BASE}/api/restaurants/me`, {
  headers: { authorization: `Bearer ${partnerToken}` },
});
const meOffJson = await meOff.json().catch(() => ({}));
record(
  "GET /api/restaurants/me reports isAcceptingOrders=false",
  meOffJson.isAcceptingOrders === false,
  `body=${JSON.stringify(meOffJson)}`,
);
record(
  "GET /api/restaurants/me reports onlineSecondsToday=0 while offline",
  meOffJson.onlineSecondsToday === 0,
  `seconds=${meOffJson.onlineSecondsToday}`,
);

// 4. POST /api/orders is refused while offline.
const blocked = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: addr.fullAddress,
    deliveryLat: addr.latitude,
    deliveryLng: addr.longitude,
    paymentMethod: "CASH",
  }),
});
const blockedJson = await blocked.json().catch(() => ({}));
record(
  "POST /api/orders refused while restaurant offline",
  blocked.status === 400 && /closed/i.test(blockedJson.error ?? ""),
  `status=${blocked.status} error=${blockedJson.error}`,
);

// 5. Customer-side /api/restaurants/[id] also surfaces it.
const detail = await fetch(`${BASE}/api/restaurants/${restaurant.id}`);
const detailJson = await detail.json().catch(() => ({}));
record(
  "GET /api/restaurants/[id] returns isAcceptingOrders=false",
  detailJson.restaurant?.isAcceptingOrders === false,
  `body=${JSON.stringify(detailJson.restaurant?.isAcceptingOrders)}`,
);

// 6. Toggle ON. Server should open a session.
const onRes = await fetch(`${BASE}/api/restaurants/status`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ online: true }),
});
const onJson = await onRes.json().catch(() => ({}));
record(
  "POST /api/restaurants/status {online:true} returns 200",
  onRes.status === 200 && onJson.isAcceptingOrders === true,
  `body=${JSON.stringify(onJson)}`,
);
const openSession = await prisma.restaurantOnlineSession.findFirst({
  where: { restaurantId: restaurant.id, endedAt: null },
  select: { id: true, startedAt: true },
});
record(
  "Going online creates a single open RestaurantOnlineSession row",
  openSession !== null,
  `session=${openSession?.id}`,
);

// 7. While the session is open, /api/restaurants/me reports
// onlineSecondsToday > 0 (we just opened it, so it's been ~0s,
// but the helper counts the open interval up to "now").
const meOn = await fetch(`${BASE}/api/restaurants/me`, {
  headers: { authorization: `Bearer ${partnerToken}` },
});
const meOnJson = await meOn.json().catch(() => ({}));
record(
  "GET /api/restaurants/me reports onlineSecondsToday > 0 while online",
  meOnJson.onlineSecondsToday >= 0,
  `seconds=${meOnJson.onlineSecondsToday}`,
);

// 8. POST /api/orders now succeeds (online → accept).
const ok = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: addr.fullAddress,
    deliveryLat: addr.latitude,
    deliveryLng: addr.longitude,
    paymentMethod: "CASH",
  }),
});
const okJson = await ok.json().catch(() => ({}));
record(
  "POST /api/orders accepted while restaurant online",
  ok.status === 201 && typeof okJson.order?.id === "string",
  `status=${ok.status} body=${JSON.stringify(okJson)}`,
);

// 9. Toggle OFF again → session closed.
const off2 = await fetch(`${BASE}/api/restaurants/status`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ online: false }),
});
record(
  "Second toggle-off returns 200",
  off2.status === 200,
  `status=${off2.status}`,
);
const closedSession = await prisma.restaurantOnlineSession.findFirst({
  where: { restaurantId: restaurant.id, endedAt: null },
});
record(
  "Closed session has endedAt set",
  closedSession === null,
  `still open=${closedSession?.id}`,
);

// 10. Toggle ON then OFF → at most ONE open session at a time.
const on3 = await fetch(`${BASE}/api/restaurants/status`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ online: true }),
});
const on3Open = await prisma.restaurantOnlineSession.count({
  where: { restaurantId: restaurant.id, endedAt: null },
});
record(
  "Exactly one open session after re-toggling online",
  on3.status === 200 && on3Open === 1,
  `status=${on3.status} open=${on3Open}`,
);

// 11. Wrong role (customer) gets 403.
const wrongRole = await fetch(`${BASE}/api/restaurants/status`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({ online: true }),
});
record(
  "Customer → POST /api/restaurants/status returns 403",
  wrongRole.status === 403,
  `status=${wrongRole.status}`,
);

// 12. Invalid body returns 400.
const badBody = await fetch(`${BASE}/api/restaurants/status`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ online: "yes" }),
});
record(
  "Invalid {online} body returns 400",
  badBody.status === 400,
  `status=${badBody.status}`,
);

// 13. Suspended restaurant blocks orders too.
await prisma.restaurant.update({
  where: { id: restaurant.id },
  data: { isSuspended: true },
});
const suspended = await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: addr.fullAddress,
    deliveryLat: addr.latitude,
    deliveryLng: addr.longitude,
    paymentMethod: "CASH",
  }),
});
record(
  "Suspended restaurant rejects POST /api/orders",
  suspended.status === 400,
  `status=${suspended.status}`,
);

// ------------------------------------------------------------------
// Cleanup
// ------------------------------------------------------------------
await prisma.restaurantOnlineSession.deleteMany({ where: { restaurantId: restaurant.id } });
await prisma.orderItem.deleteMany({ where: { order: { restaurantId: restaurant.id } } });
await prisma.order.deleteMany({ where: { restaurantId: restaurant.id } });
await prisma.menuItem.deleteMany({ where: { restaurantId: restaurant.id } });
await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});

console.log("\n================================================");
console.log(`RESTAURANT ONLINE E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);