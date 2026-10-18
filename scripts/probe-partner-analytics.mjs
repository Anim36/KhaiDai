// scripts/probe-partner-analytics.mjs
//
// Feat 1 — Partner analytics smoke test.
//
// Strategy: capture a baseline snapshot BEFORE seeding any
// probe orders, seed DELIVERED + CANCELLED orders with a
// recognisable `specialInstructions` prefix, then assert the
// deltas (orders added, revenue added, items added to
// topItems) rather than absolute counts. This way the probe
// works regardless of whatever real orders are already on the
// restaurant from previous probes / demos.
//
// What it covers:
//   1. GET /api/partner/analytics?from=&to= returns the
//      expected shape (summary, dailyRevenue, topItems,
//      statusBreakdown) with non-null structure.
//   2. Seeding +3 DELIVERED +1 CANCELLED bumps the API's
//      DELIVERED count by exactly 3, CANCELLED by exactly 1.
//   3. The "Probe Analytics Item" rises to the top of
//      topItems when seeded with the highest quantity.
//   4. Date-range validation: from > to → 400; > 366d → 400.
//   5. Non-partner (customer) → 403.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";
const CUSTOMER = {
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER",
};
const PARTNER = {
  email: "sslcz.partner@example.com",
  password: PASSWORD,
  expectedRole: "PARTNER",
};

const a = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: a });

let pass = 0, fail = 0;
function check(name, ok, info = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? " — " + info : ""}`); }
  else    { fail++; console.log(`  ✗ ${name}${info ? " — " + info : ""}`); }
}

async function login({ email, password, expectedRole }) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).token;
}

const customerToken = await login(CUSTOMER);
const partnerToken = await login(PARTNER);

const partner = await prisma.user.findUniqueOrThrow({
  where: { email: PARTNER.email },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, address: true },
});
const customer = await prisma.user.findUniqueOrThrow({
  where: { email: CUSTOMER.email },
  select: { id: true },
});

// ---- 0. Capture baseline (AFTER wiping prior probe rows) -------
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(today.getDate() - 2);
// Use a forward-padded `to` so we don't drop "today" orders at
// the boundary — `today.toISOString()` is UTC midnight, which
// is BEFORE the actual `createdAt` we set on seeded rows.
const from = twoDaysAgo.toISOString().slice(0, 10);
const toBuf = new Date(today);
toBuf.setDate(toBuf.getDate() + 1);
const to = toBuf.toISOString().slice(0, 10);

const url = `${BASE}/api/partner/analytics?from=${from}&to=${to}`;

// Wipe any prior probe orders FIRST so the baseline reflects
// the steady-state without our contributions. (Re-runs of this
// probe would otherwise stack deltas on top of stale data.)
const probeMarker = "agg-order-";
await prisma.order.deleteMany({
  where: { restaurantId: restaurant.id, specialInstructions: { startsWith: probeMarker } },
});

let topItem = await prisma.menuItem.findFirst({
  where: { restaurantId: restaurant.id, name: "Probe Analytics Item" },
  select: { id: true, price: true },
});
if (!topItem) {
  topItem = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      name: "Probe Analytics Item",
      price: 100,
      category: "Test",
      available: true,
    },
    select: { id: true, price: true },
  });
}

const baselineResp = await fetch(url, {
  headers: { authorization: `Bearer ${partnerToken}` },
});
const baseline = await baselineResp.json();
check(
  "baseline GET returns 200",
  baselineResp.status === 200,
  `status=${baselineResp.status}`,
);
check(
  "baseline has restaurants list",
  Array.isArray(baseline?.restaurants) && baseline.restaurants.length > 0,
  `n=${baseline?.restaurants?.length}`,
);
check(
  "baseline has summary block",
  typeof baseline?.summary?.totalOrders === "number",
  `summary=${JSON.stringify(baseline?.summary)}`,
);
check(
  "baseline has dailyRevenue[]",
  Array.isArray(baseline?.dailyRevenue),
  `len=${baseline?.dailyRevenue?.length}`,
);
check(
  "baseline has topItems[]",
  Array.isArray(baseline?.topItems),
  `len=${baseline?.topItems?.length}`,
);
check(
  "baseline has statusBreakdown[]",
  Array.isArray(baseline?.statusBreakdown),
  `len=${baseline?.statusBreakdown?.length}`,
);
check(
  "baseline has busiestDay + busiestHour",
  typeof baseline?.summary?.busiestDay?.date === "string" &&
    typeof baseline?.summary?.busiestHour?.hour === "number",
  `day=${baseline?.summary?.busiestDay?.date} hour=${baseline?.summary?.busiestHour?.hour}`,
);

const baseDelivered = baseline?.summary?.totalOrders ?? 0;
const baseRevenue = baseline?.summary?.totalRevenue ?? 0;
const baseByStatus = Object.fromEntries(
  (baseline?.statusBreakdown ?? []).map((s) => [s.status, s.count]),
);
const baseDeliveredCount = baseByStatus.DELIVERED ?? 0;
const baseCancelledCount = baseByStatus.CANCELLED ?? 0;

async function seedOrder({ status, createdAt, items, special }) {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const total = subtotal + 30; // pretend delivery fee
  return prisma.order.create({
    data: {
      customerId: customer.id,
      restaurantId: restaurant.id,
      status,
      subtotal,
      deliveryFee: 30,
      total,
      deliveryAddress: restaurant.address,
      paymentMethod: "CASH",
      paymentGatewayStatus: "NOT_INITIATED",
      createdAt,
      specialInstructions: special,
      items: { create: items },
    },
    select: { id: true, status: true, total: true, createdAt: true },
  });
}

const seededTotals = { deliveredRevenue: 0, cancelledCount: 0, deliveredCount: 0 };
async function trackAndSeed(args) {
  const o = await seedOrder(args);
  if (o.status === "DELIVERED") {
    seededTotals.deliveredRevenue += o.total;
    seededTotals.deliveredCount += 1;
  } else if (o.status === "CANCELLED") {
    seededTotals.cancelledCount += 1;
  }
  return o;
}

const seeded = [];
seeded.push(await trackAndSeed({
  status: "DELIVERED",
  createdAt: twoDaysAgo,
  items: [{ menuItemId: topItem.id, quantity: 3, price: topItem.price }],
  special: `${probeMarker}-day-2`,
}));
seeded.push(await trackAndSeed({
  status: "DELIVERED",
  createdAt: yesterday,
  items: [{ menuItemId: topItem.id, quantity: 2, price: topItem.price }],
  special: `${probeMarker}-day-1`,
}));
seeded.push(await trackAndSeed({
  status: "DELIVERED",
  createdAt: today,
  items: [{ menuItemId: topItem.id, quantity: 1, price: topItem.price }],
  special: `${probeMarker}-today`,
}));
seeded.push(await trackAndSeed({
  status: "CANCELLED",
  createdAt: today,
  items: [{ menuItemId: topItem.id, quantity: 1, price: topItem.price }],
  special: `${probeMarker}-today-cancelled`,
}));
console.log(`  seeded: +${seededTotals.deliveredCount} DELIVERED (+${seededTotals.deliveredRevenue} ৳) and +${seededTotals.cancelledCount} CANCELLED`);
console.log(`  seeded ids: ${seeded.map((s) => `${s.id}@${s.createdAt.toISOString()}`).join(", ")}`);

// ---- 2. Re-fetch and assert deltas ----------------------------
const resp2 = await fetch(url, {
  headers: { authorization: `Bearer ${partnerToken}` },
});
const after = await resp2.json();
check(
  "after-seed GET returns 200",
  resp2.status === 200,
  `status=${resp2.status}`,
);

check(
  "DELIVERED count incremented by 3",
  after?.summary?.totalOrders - baseDelivered === 3,
  `before=${baseDelivered} after=${after?.summary?.totalOrders}`,
);
check(
  "Total revenue incremented by seeded sum",
  after?.summary?.totalRevenue - baseRevenue === seededTotals.deliveredRevenue,
  `delta=${after?.summary?.totalRevenue - baseRevenue} expected=${seededTotals.deliveredRevenue}`,
);

const afterByStatus = Object.fromEntries(
  (after?.statusBreakdown ?? []).map((s) => [s.status, s.count]),
);
check(
  "DELIVERED statusBreakdown bucket incremented by 3",
  (afterByStatus.DELIVERED ?? 0) - baseDeliveredCount === 3,
  `before=${baseDeliveredCount} after=${afterByStatus.DELIVERED}`,
);
check(
  "CANCELLED statusBreakdown bucket incremented by 1",
  (afterByStatus.CANCELLED ?? 0) - baseCancelledCount === 1,
  `before=${baseCancelledCount} after=${afterByStatus.CANCELLED}`,
);

// Top items: our seeded item was bought 6 times, so it should
// jump to the top of topItems (or stay at #1 with bumped quantity).
const topAfter = after?.topItems?.[0];
check(
  "Probe Analytics Item is topItems[0]",
  topAfter?.name === "Probe Analytics Item",
  `name=${topAfter?.name}`,
);
const baselineTopQty =
  baseline?.topItems?.find((t) => t.name === "Probe Analytics Item")
    ?.quantitySold ?? 0;
check(
  "Probe Analytics Item quantitySold bumped by 6",
  (topAfter?.quantitySold ?? 0) - baselineTopQty >= 6,
  `before=${baselineTopQty} after=${topAfter?.quantitySold}`,
);

// ---- 3. Validation --------------------------------------------
const reversedRange = await fetch(
  `${BASE}/api/partner/analytics?from=${to}&to=${from}`,
  { headers: { authorization: `Bearer ${partnerToken}` } },
);
check(
  "from > to → 400",
  reversedRange.status === 400,
  `status=${reversedRange.status}`,
);

const hugeRange = await fetch(
  `${BASE}/api/partner/analytics?from=2020-01-01&to=2030-01-01`,
  { headers: { authorization: `Bearer ${partnerToken}` } },
);
check(
  "range > 366d → 400",
  hugeRange.status === 400,
  `status=${hugeRange.status}`,
);

// ---- 4. Role gate ---------------------------------------------
const asCustomer = await fetch(url, {
  headers: { authorization: `Bearer ${customerToken}` },
});
check(
  "customer cannot hit partner analytics → 403",
  asCustomer.status === 403,
  `status=${asCustomer.status}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);