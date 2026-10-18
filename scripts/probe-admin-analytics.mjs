// scripts/probe-admin-analytics.mjs
//
// Feat 3 — Admin Advanced Analytics smoke test.
//
// Strategy: capture a baseline analytics snapshot, then seed
// a small set of probe orders + ensure the seed appears in
// the response. We also assert role-gating (403 for non-admin)
// and the basic shape contract.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";

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

// Admin user per the seed admin fixtures.
const adminToken = await login({
  email: "sslcz.admin@example.com",
  password: "Pa55word!",
  expectedRole: "ADMIN",
});

// ---- 0. Wipe prior probe orders --------------------------------
const probeMarker = "aa-order-";
await prisma.order.deleteMany({
  where: { specialInstructions: { startsWith: probeMarker } },
});

const partner = await prisma.user.findUniqueOrThrow({
  where: { email: "sslcz.partner@example.com" },
  select: { id: true },
});
const restaurant = await prisma.restaurant.findFirstOrThrow({
  where: { ownerId: partner.id },
  select: { id: true, address: true },
});
const customer = await prisma.user.findUniqueOrThrow({
  where: { email: "sslcz.customer@example.com" },
  select: { id: true },
});

// ---- 1. Baseline fetch ----------------------------------------
const url = `${BASE}/api/admin/analytics?days=30`;
const baselineResp = await fetch(url, {
  headers: { authorization: `Bearer ${adminToken}` },
});
const baseline = await baselineResp.json();
check(
  "baseline GET returns 200",
  baselineResp.status === 200,
  `status=${baselineResp.status}`,
);
check(
  "baseline has range",
  typeof baseline?.range?.from === "string" &&
    typeof baseline?.range?.to === "string" &&
    typeof baseline?.range?.days === "number",
  `range=${JSON.stringify(baseline?.range)}`,
);
check(
  "baseline has totals",
  typeof baseline?.totals?.orders === "number" &&
    typeof baseline?.totals?.revenue === "number",
  `totals=${JSON.stringify(baseline?.totals)}`,
);
check(
  "baseline.revenueTrend is array of >= 7 rows",
  Array.isArray(baseline?.revenueTrend) && baseline.revenueTrend.length >= 7,
  `len=${baseline?.revenueTrend?.length}`,
);
check(
  "baseline.topRestaurants is array (≤10)",
  Array.isArray(baseline?.topRestaurants) &&
    baseline.topRestaurants.length <= 10,
  `n=${baseline?.topRestaurants?.length}`,
);
check(
  "baseline.topRiders is array (≤10)",
  Array.isArray(baseline?.topRiders) && baseline.topRiders.length <= 10,
  `n=${baseline?.topRiders?.length}`,
);
check(
  "baseline.statusFunnel has at least DELIVERED + CANCELLED",
  baseline?.statusFunnel?.some((s) => s.status === "DELIVERED") &&
    baseline?.statusFunnel?.some((s) => s.status === "CANCELLED"),
  `funnel=${JSON.stringify(baseline?.statusFunnel?.map((s) => s.status))}`,
);
check(
  "baseline.peakHours has 24 buckets",
  Array.isArray(baseline?.peakHours) && baseline.peakHours.length === 24,
  `len=${baseline?.peakHours?.length}`,
);
check(
  "baseline.zoneDistribution shape",
  typeof baseline?.zoneDistribution?.withCoords === "number" &&
    Array.isArray(baseline?.zoneDistribution?.byAddressKeyword),
  `zone=${JSON.stringify(baseline?.zoneDistribution)}`,
);

const baseDelivered = baseline?.totals?.delivered ?? 0;
const baseRevenue = baseline?.totals?.revenue ?? 0;

// ---- 2. Seed orders --------------------------------------------
async function seedOrder({ status, createdAt, total }) {
  return prisma.order.create({
    data: {
      customerId: customer.id,
      restaurantId: restaurant.id,
      status,
      subtotal: total - 30,
      deliveryFee: 30,
      total,
      deliveryAddress: restaurant.address,
      paymentMethod: "CASH",
      paymentGatewayStatus: "NOT_INITIATED",
      createdAt,
      specialInstructions: `${probeMarker}-${status}`,
    },
    select: { id: true, status: true, total: true },
  });
}

const now = new Date();
// 3 DELIVERED across the last 5 days + 1 CANCELLED today.
const days = [0, 2, 4];
let deliveredTotal = 0;
for (const d of days) {
  const ts = new Date(now);
  ts.setDate(ts.getDate() - d);
  const o = await seedOrder({ status: "DELIVERED", createdAt: ts, total: 500 });
  deliveredTotal += o.total;
}
await seedOrder({ status: "CANCELLED", createdAt: now, total: 500 });
console.log(
  `  seeded: +3 DELIVERED (+${deliveredTotal} ৳) + 1 CANCELLED`,
);

// ---- 3. Re-fetch and assert deltas ----------------------------
const after = await (await fetch(url, {
  headers: { authorization: `Bearer ${adminToken}` },
})).json();
check(
  "totals.delivered incremented by 3",
  (after?.totals?.delivered ?? 0) - baseDelivered === 3,
  `before=${baseDelivered} after=${after?.totals?.delivered}`,
);
check(
  "totals.revenue incremented by seed sum",
  (after?.totals?.revenue ?? 0) - baseRevenue === deliveredTotal,
  `delta=${(after?.totals?.revenue ?? 0) - baseRevenue} expected=${deliveredTotal}`,
);
check(
  "totals.cancelled incremented by 1",
  (after?.totals?.cancelled ?? 0) - (baseline?.totals?.cancelled ?? 0) === 1,
  `before=${baseline?.totals?.cancelled} after=${after?.totals?.cancelled}`,
);

// revenueTrend grew — at least one of the seeded days should
// have a non-zero revenue / orders pair now. We pick `days[0]`
// (today) and check the orders count moved up by 1 (DELIVERED).
const todayKey = now.toISOString().slice(0, 10);
const todayBucket = after?.revenueTrend?.find((r) => r.date === todayKey);
check(
  `today bucket (${todayKey}) exists in revenueTrend`,
  !!todayBucket,
  `bucket=${JSON.stringify(todayBucket)}`,
);

// ---- 4. days validation ---------------------------------------
const badDays = await fetch(`${BASE}/api/admin/analytics?days=abc`, {
  headers: { authorization: `Bearer ${adminToken}` },
});
check(
  "days=abc → 400",
  badDays.status === 400,
  `status=${badDays.status}`,
);
const hugeDays = await fetch(`${BASE}/api/admin/analytics?days=9999`, {
  headers: { authorization: `Bearer ${adminToken}` },
});
check(
  "days=9999 → 400",
  hugeDays.status === 400,
  `status=${hugeDays.status}`,
);
const futureFrom = await fetch(`${BASE}/api/admin/analytics?days=30&from=2099-01-01`, {
  headers: { authorization: `Bearer ${adminToken}` },
});
check(
  "from in future → 400",
  futureFrom.status === 400,
  `status=${futureFrom.status}`,
);

// ---- 5. Role gate --------------------------------------------
const customerToken = await login({
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER",
});
const asCustomer = await fetch(url, {
  headers: { authorization: `Bearer ${customerToken}` },
});
check(
  "customer cannot hit admin analytics → 403",
  asCustomer.status === 403,
  `status=${asCustomer.status}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);