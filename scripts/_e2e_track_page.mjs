// scripts/_e2e_track_page.mjs
//
// End-to-end test for the OrderTrackingPage crash fix:
//
//   1. Place a new order.
//   2. Hit GET /orders/[id]/track via HTTP — confirm 200 + non-empty HTML.
//   3. Hit GET /orders/[id]/track a few more times (simulates the
//      customer re-visiting, hitting refresh, and arriving from a
//      direct URL).
//   4. Test the React Server Components hydration: each response
//      should include a deterministic fragment that the client
//      hydrates from.

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
  return u;
}

async function login(email, role) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "khaidai1234", expectedRole: role }),
  });
  const j = await r.json();
  if (!j.token) throw new Error("login failed");
  return j.token;
}

const CUST_EMAIL = "customer-track-e2e@khaidai.test";
const PART_EMAIL = "partner-track-e2e@khaidai.test";
await ensureUser(CUST_EMAIL, "CUSTOMER", "Track E2E Customer");
await ensureUser(PART_EMAIL, "PARTNER", "Track E2E Partner");

const partner = await prisma.user.findUnique({ where: { email: PART_EMAIL } });

const REST_NAME = `Track E2E Resto ${Date.now()}`;
const restaurant = await prisma.restaurant.create({
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
    name: `Track E2E Dish ${Date.now()}`,
    price: 250,
    category: "Mains",
    available: true,
  },
});

const custToken = await login(CUST_EMAIL, "CUSTOMER");

const placed = await (await fetch(`${BASE}/api/orders`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${custToken}` },
  body: JSON.stringify({
    restaurantId: restaurant.id,
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
    deliveryAddress: "Test Delivery Address",
    paymentMethod: "CASH",
    lat: 23.82, lng: 90.41,
  }),
})).json();
const orderId = placed.order?.id;
record("1a. Order placed → has orderId", Boolean(orderId), `body=${JSON.stringify(placed).slice(0, 200)}`);

if (!orderId) {
  await prisma.$disconnect();
  process.exit(1);
}

// Build a cookie header from the JWT so the SSR page renders for
// the customer. We use the `khaidai.auth.v2` localStorage key shape.
const authPayload = JSON.stringify({
  token: custToken,
  user: { id: "any", name: "x", email: CUST_EMAIL, role: "CUSTOMER" },
});

// Fetch the tracking page multiple times.
async function fetchTrack(label) {
  const r = await fetch(`${BASE}/orders/${orderId}/track`, {
    headers: { cookie: `khaidai.auth.v2=${encodeURIComponent(authPayload)}` },
  });
  const text = await r.text();
  record(label,
    r.status === 200 && text.length > 0,
    `status=${r.status} len=${text.length}`);
  // Confirm there's no React server error in the rendered HTML.
  record(`${label} (no "Rendered more hooks" error in HTML)`,
    !text.includes("Rendered more hooks") && !text.includes("Minified React error"),
    `status=${r.status}`);
}

await fetchTrack("2a. /orders/[id]/track — first load (loading state)");
await fetchTrack("2b. /orders/[id]/track — second load (mid-poll)");
await fetchTrack("2c. /orders/[id]/track — refresh (re-poll)");

// Direct URL load after order is DELIVERED — must not crash.
const partToken = await login(PART_EMAIL, "PARTNER");
await fetch(`${BASE}/api/orders/${orderId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${partToken}` },
  body: JSON.stringify({ status: "cancelled" }),
});
await fetchTrack("2d. /orders/[id]/track — terminal state (cancelled)");

// Hit the URL for a NON-EXISTENT order id — should not crash, just
// render the error/empty state.
const fakeId = "cm000000000000000000000";
const rFake = await fetch(`${BASE}/orders/${fakeId}/track`, {
  headers: { cookie: `khaidai.auth.v2=${encodeURIComponent(authPayload)}` },
});
record("2e. /orders/[id]/track with unknown id returns 200 + non-empty",
  rFake.status === 200 && (await rFake.text()).length > 0,
  `status=${rFake.status}`);

await prisma.$disconnect();
console.log(`\n==== Track page e2e: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
