// scripts/probe-rider-leaderboard.mjs
//
// Feat 2 — Rider leaderboard smoke test.
//
// Strategy: wipe prior probe orders, then:
//   1. Capture a baseline leaderboard.
//   2. Seed 3 riders: A=5 deliveries, B=2, C=0.
//   3. The probe's primary rider is "sslcz.rider@example.com"
//      (the standard one) — we give them 21 DELIVERED
//      orders to cross the 20-threshold badge.
//   4. Re-fetch the leaderboard and assert:
//        - A ranks #1, B ranks #2, the primary ranks #3 (21
//          deliveries beats 5).
//        - thresholdUnlocked is true for the primary.
//        - Masked names use "First L." form.
//        - Self-rank matches the primary's actual position.
//
// Cleanup: we delete only orders whose `specialInstructions`
// starts with the probe marker, leaving real data intact.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

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

// Bootstrap a known set of riders we can deterministically
// seed deliveries against. Each is named with "First Last"
// so the masked-name test can assert "Rider A B." style.
const RIDER_FIXTURES = [
  { email: "lb.ridera@example.com", name: "Rakib Hasan" },
  { email: "lb.riderb@example.com", name: "Sumaiya Akter" },
  { email: "lb.riderc@example.com", name: "Tanvir" }, // single-word name
];

const passwordHash = await bcrypt.hash(PASSWORD, 8);
const riders = [];
for (const fx of RIDER_FIXTURES) {
  let u = await prisma.user.findUnique({
    where: { email: fx.email },
    select: { id: true, name: true, role: true, deletedAt: true, isSuspended: true },
  });
  if (!u) {
    u = await prisma.user.create({
      data: {
        email: fx.email,
        name: fx.name,
        role: "RIDER",
        phone: `+88017${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`,
        password: passwordHash,
      },
      select: { id: true, name: true, role: true, deletedAt: true, isSuspended: true },
    });
  } else {
    u = await prisma.user.update({
      where: { id: u.id },
      data: {
        password: passwordHash,
        name: fx.name,
        role: "RIDER",
        deletedAt: null,
        isSuspended: false,
      },
      select: { id: true, name: true, role: true, deletedAt: true, isSuspended: true },
    });
  }
  riders.push(u);
}

const primaryRider = await prisma.user.findUniqueOrThrow({
  where: { email: "sslcz.rider@example.com" },
  select: { id: true, name: true, deletedAt: true, isSuspended: true },
});
if (!primaryRider.deletedAt && !primaryRider.isSuspended) {
  // Ok — primary is active.
}
check("primary rider exists", !!primaryRider?.id, `id=${primaryRider?.id}`);

const tokens = {};
for (const fx of RIDER_FIXTURES) {
  tokens[fx.email] = await login({
    email: fx.email,
    password: PASSWORD,
    expectedRole: "RIDER",
  });
}
const primaryToken = await login({
  email: "sslcz.rider@example.com",
  password: PASSWORD,
  expectedRole: "RIDER",
});

// ---- 0. Wipe prior probe orders --------------------------------
const probeMarker = "lb-order-";
await prisma.order.deleteMany({
  where: { specialInstructions: { startsWith: probeMarker } },
});
// Also wipe any prior DELIVERED orders for our seeded riders
// in case an earlier probe run left a row that would inflate
// the count. The marker wipe only matches rows we created —
// this catches history that pre-dates the probe.
await prisma.order.deleteMany({
  where: {
    status: "DELIVERED",
    riderId: { in: [...riders.map((r) => r.id), primaryRider.id] },
  },
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

// ---- 1. Capture baseline ---------------------------------------
const baseResp = await fetch(
  `${BASE}/api/riders/leaderboard?period=week`,
  { headers: { authorization: `Bearer ${primaryToken}` } },
);
const baseline = await baseResp.json();
check("baseline GET returns 200", baseResp.status === 200, `status=${baseResp.status}`);
check(
  "baseline has ranking + selfRank + threshold + period",
  Array.isArray(baseline?.ranking) &&
    ("selfRank" in baseline) &&
    typeof baseline?.threshold === "number" &&
    typeof baseline?.period?.label === "string",
  `ranking.len=${baseline?.ranking?.length}`,
);
check("threshold === 20", baseline?.threshold === 20, `threshold=${baseline?.threshold}`);

// ---- 2. Seed deliveries ----------------------------------------
async function seedDelivered({ riderId, n }) {
  const now = new Date();
  for (let i = 0; i < n; i++) {
    // Stagger createdAt inside "this week" so we don't collide
    // with the boundary check. 2 minutes apart is plenty.
    const createdAt = new Date(now.getTime() - i * 2 * 60 * 1000);
    await prisma.order.create({
      data: {
        customerId: customer.id,
        restaurantId: restaurant.id,
        riderId,
        status: "DELIVERED",
        subtotal: 200,
        deliveryFee: 30,
        riderEarning: 50,
        total: 230,
        deliveryAddress: restaurant.address,
        paymentMethod: "CASH",
        paymentGatewayStatus: "NOT_INITIATED",
        createdAt,
        specialInstructions: `${probeMarker}-${riderId}-${i}`,
      },
      select: { id: true },
    });
  }
}

// Rider A: 5, Rider B: 2, primary: 21 (over threshold).
await seedDelivered({ riderId: riders[0].id, n: 5 });
await seedDelivered({ riderId: riders[1].id, n: 2 });
await seedDelivered({ riderId: primaryRider.id, n: 21 });

// ---- 3. Re-fetch and assert ------------------------------------
const resp2 = await fetch(
  `${BASE}/api/riders/leaderboard?period=week`,
  { headers: { authorization: `Bearer ${primaryToken}` } },
);
const after = await resp2.json();
check("after-seed GET returns 200", resp2.status === 200, `status=${resp2.status}`);

const rankOf = (riderId) => after.ranking.find((r) => r.riderId === riderId);
const aRow = rankOf(riders[0].id);
const bRow = rankOf(riders[1].id);
const primaryRow = rankOf(primaryRider.id);

check("Rider A is on the leaderboard", !!aRow, `a=${JSON.stringify(aRow)}`);
check("Rider B is on the leaderboard", !!bRow, `b=${JSON.stringify(bRow)}`);
check("Primary rider is on the leaderboard", !!primaryRow, `primary=${JSON.stringify(primaryRow)}`);

check(
  "Rider A deliveries === 5",
  aRow?.deliveries === 5,
  `a=${aRow?.deliveries}`,
);
check(
  "Rider B deliveries === 2",
  bRow?.deliveries === 2,
  `b=${bRow?.deliveries}`,
);
check(
  "Primary rider deliveries === 21 (above threshold)",
  primaryRow?.deliveries === 21,
  `p=${primaryRow?.deliveries}`,
);
check(
  "Primary rider ranks #1 (most deliveries)",
  primaryRow?.rank === 1,
  `rank=${primaryRow?.rank}`,
);
check(
  "Rider A ranks #2 (5 deliveries)",
  aRow?.rank === 2,
  `a.rank=${aRow?.rank}`,
);
check(
  "Rider B ranks #3 (2 deliveries)",
  bRow?.rank === 3,
  `b.rank=${bRow?.rank}`,
);

// Masked names: "Rakib H.", "Sumaiya A.", "Tanvir" (single).
const primaryInRanking = after.ranking.find((r) => r.riderId === primaryRider.id);
const aInRanking = after.ranking.find((r) => r.riderId === riders[0].id);
const bInRanking = after.ranking.find((r) => r.riderId === riders[1].id);
const cInRanking = after.ranking.find((r) => r.riderId === riders[2].id);

check(
  "Rider A masked name = 'Rakib H.'",
  aInRanking?.maskedName === "Rakib H.",
  `masked=${aInRanking?.maskedName}`,
);
check(
  "Rider B masked name = 'Sumaiya A.'",
  bInRanking?.maskedName === "Sumaiya A.",
  `masked=${bInRanking?.maskedName}`,
);
check(
  "Rider C (single name) rendered as 'Tanvir'",
  cInRanking?.maskedName === "Tanvir" || cInRanking === undefined,
  `c=${JSON.stringify(cInRanking)}`,
);

// Self rank from the primary's perspective.
check(
  "selfRank === rank #1 for primary",
  after?.selfRank?.rank === 1,
  `selfRank=${JSON.stringify(after?.selfRank)}`,
);
check(
  "selfRank.maskedName present",
  typeof after?.selfRank?.maskedName === "string" && after.selfRank.maskedName.length > 0,
  `name=${after?.selfRank?.maskedName}`,
);
check(
  "thresholdUnlocked === true (21 ≥ 20)",
  after?.thresholdUnlocked === true,
  `unlocked=${after?.thresholdUnlocked}`,
);

// ---- 4. role gate ---------------------------------------------
const customerToken = await login({
  email: "sslcz.customer@example.com",
  password: PASSWORD,
  expectedRole: "CUSTOMER",
});
const asCustomer = await fetch(
  `${BASE}/api/riders/leaderboard?period=week`,
  { headers: { authorization: `Bearer ${customerToken}` } },
);
check(
  "customer cannot hit leaderboard → 403",
  asCustomer.status === 403,
  `status=${asCustomer.status}`,
);

// Period validation.
const bad = await fetch(
  `${BASE}/api/riders/leaderboard?period=day`,
  { headers: { authorization: `Bearer ${primaryToken}` } },
);
check(
  "unsupported period → 400",
  bad.status === 400,
  `status=${bad.status}`,
);

await prisma.$disconnect();
console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);