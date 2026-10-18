// End-to-end: /offers page is wired to real PromoCode rows.
//
// কাজ ১ — assertions:
//   1. /offers page returns 200 with no "Rendered more hooks" /
//      "Minified React error" crash markers.
//   2. GET /api/promo-codes/active returns the active rows from
//      the DB, with `restaurantId` + `restaurantName` (or null for
//      platform-wide codes). Demo codes like FREEDEL/BIRYANI20 are
//      never in the DB.
//   3. We create a fresh partner-scoped code, hit
//      GET /api/promo-codes/active again, and confirm the new row
//      appears in the response.
//   4. An expired / inactive code does NOT appear.

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

const PART_EMAIL = "partner-offers-e2e@khaidai.test";
await ensureUser(PART_EMAIL, "PARTNER", "Offers E2E Partner");
const partner = await prisma.user.findUnique({ where: { email: PART_EMAIL } });

// Make a unique restaurant for this test so we can scope cleanup.
const REST_NAME = `Offers E2E Resto ${Date.now()}`;
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

// Snapshot active codes before we add ours, so we can assert "the
// newly added code appears" without depending on what's already in
// the DB.
const before = await fetch(`${BASE}/api/promo-codes/active`).then((r) => r.json());
const beforeCodes = Array.isArray(before.promos) ? before.promos : [];

// 1. Demo codes are not in the DB.
const demoCodes = ["FREEDEL", "BIRYANI20", "CHILLOXBOGO", "WELCOME120", "SWEETWEEKEND", "LUNCH50"];
const demoHits = demoCodes.filter((c) => beforeCodes.some((p) => p.code === c));
record(
  "Demo codes (FREEDEL/BIRYANI20/etc) NOT in /api/promo-codes/active",
  demoHits.length === 0,
  `leaked=${demoHits.join(",")}`,
);

// 2. Response shape includes restaurantId / restaurantName.
const sample = beforeCodes[0];
record(
  "Promo entries expose restaurantId + restaurantName (null for platform)",
  sample === undefined ||
    (("restaurantId" in sample) && ("restaurantName" in sample)),
  `sample=${JSON.stringify(sample)}`,
);

// 3. /offers page returns 200 + no crash markers.
const offersPage = await fetch(`${BASE}/offers`);
const html = await offersPage.text();
const fails = [];
if (offersPage.status !== 200) fails.push(`status=${offersPage.status}`);
if (html.length < 500) fails.push(`bodyLen=${html.length}`);
if (html.includes("Rendered more hooks")) fails.push(`hooks crash leaked`);
if (html.includes("Minified React error")) fails.push(`minified react error`);
if (fails.length) {
  record("GET /offers returns 200 + no hooks crash", false, fails.join("; "));
} else {
  record(`GET /offers returns 200 + no hooks crash (${html.length} bytes)`, true);
}

// 4. Create a fresh partner-scoped code, hit the API again, confirm.
const SUFFIX = Date.now();
const NEW_CODE = `OFFERSE2E${SUFFIX}`;
const created = await prisma.promoCode.create({
  data: {
    code: NEW_CODE,
    restaurantId: restaurant.id,
    discountType: "PERCENTAGE",
    discountValue: 25,
    minOrderAmount: 100,
    maxDiscount: 60,
    isActive: true,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  },
});

const after = await fetch(`${BASE}/api/promo-codes/active`).then((r) => r.json());
const afterCodes = Array.isArray(after.promos) ? after.promos : [];
const freshEntry = afterCodes.find((p) => p.code === NEW_CODE);
record(
  `New partner code ${NEW_CODE} appears in /api/promo-codes/active`,
  freshEntry !== undefined,
  `found=${freshEntry !== undefined}`,
);
record(
  `New partner entry has restaurantName="${REST_NAME}"`,
  freshEntry?.restaurantName === REST_NAME,
  `restaurantName=${freshEntry?.restaurantName}`,
);
record(
  `New partner entry has restaurantId="${restaurant.id}"`,
  freshEntry?.restaurantId === restaurant.id,
  `restaurantId=${freshEntry?.restaurantId}`,
);

// 5. Expired / inactive codes do NOT appear.
const EXPIRED_CODE = `OFFERSE2E_EXPIRED_${SUFFIX}`;
await prisma.promoCode.create({
  data: {
    code: EXPIRED_CODE,
    restaurantId: restaurant.id,
    discountType: "FIXED",
    discountValue: 50,
    isActive: true,
    expiresAt: new Date(Date.now() - 86_400_000), // yesterday
  },
});
const INACTIVE_CODE = `OFFERSE2E_INACTIVE_${SUFFIX}`;
await prisma.promoCode.create({
  data: {
    code: INACTIVE_CODE,
    restaurantId: restaurant.id,
    discountType: "FIXED",
    discountValue: 50,
    isActive: false,
  },
});
const after2 = await fetch(`${BASE}/api/promo-codes/active`).then((r) => r.json());
const codes2 = Array.isArray(after2.promos) ? after2.promos : [];
record(
  "Expired code NOT in /api/promo-codes/active",
  !codes2.some((p) => p.code === EXPIRED_CODE),
  `present=${codes2.some((p) => p.code === EXPIRED_CODE)}`,
);
record(
  "Inactive code NOT in /api/promo-codes/active",
  !codes2.some((p) => p.code === INACTIVE_CODE),
  `present=${codes2.some((p) => p.code === INACTIVE_CODE)}`,
);

// 6. Cleanup
await prisma.promoCode.deleteMany({
  where: { code: { in: [NEW_CODE, EXPIRED_CODE, INACTIVE_CODE] } },
});
await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});

console.log("\n================================================");
console.log(`OFFERS E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);