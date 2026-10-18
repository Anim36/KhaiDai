// scripts/_e2e_toggle_persistence.mjs
//
// Verifies the rider notification toggles end-to-end:
//   • GET /api/riders/me reports the three flags
//   • PATCH /api/riders/notification-preferences accepts boolean flips
//   • Each toggle persists independently (flipping one doesn't change the others)
//   • A non-boolean body returns 400
//   • The DB row reflects the flips
//   • After a "refresh" (re-login + re-fetch me) the values remain

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EMAIL = "rider-toggle-test@khaidai.test";
const PASS = "khaidai1234";

let passed = 0;
let failed = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else    { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

async function ensureRider() {
  let u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!u) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash(PASS, 12);
    u = await prisma.user.create({
      data: { email: EMAIL, name: "Toggle Test", role: "RIDER", password: hash },
    });
  }
  return u;
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS, expectedRole: "RIDER" }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return (await res.json()).token;
}

const u = await ensureRider();
// Reset prefs to a known starting state.
await prisma.riderProfile.upsert({
  where: { userId: u.id },
  update: { notifyNewRequest: true, notifyPayout: true, notifyWeeklySummary: false },
  create: {
    userId: u.id,
    vehicleType: "bike", vehicleRegNumber: "DHA-TOG-1234",
    notifyNewRequest: true, notifyPayout: true, notifyWeeklySummary: false,
  },
});

let token = await login();

// 1. GET /api/riders/me reports the three flags.
const meRes = await fetch(`${BASE}/api/riders/me`, { headers: { authorization: `Bearer ${token}` } });
const meJ = await meRes.json();
const initial = {
  notifyNewRequest: meJ?.rider?.notifyNewRequest,
  notifyPayout: meJ?.rider?.notifyPayout,
  notifyWeeklySummary: meJ?.rider?.notifyWeeklySummary,
};
record(
  "1. GET /api/riders/me reports the three flags",
  initial.notifyNewRequest === true &&
    initial.notifyPayout === true &&
    initial.notifyWeeklySummary === false,
  JSON.stringify(initial),
);

// 2. Flip each toggle independently. PATCH should accept partial boolean-only.
const flips = [
  { notifyNewRequest: false },
  { notifyPayout: false },
  { notifyWeeklySummary: true },
];

for (const [i, body] of flips.entries()) {
  const res = await fetch(`${BASE}/api/riders/notification-preferences`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  record(`2.${i+1} flip ${Object.keys(body)[0]}=${Object.values(body)[0]} → 200`,
    res.status === 200, `status=${res.status}`);
}

// 3. Re-read /api/riders/me — flips stuck, unaffected each other.
const meAfter = await (await fetch(`${BASE}/api/riders/me`, { headers: { authorization: `Bearer ${token}` } })).json();
const after = meAfter.rider;
record("3. notifyNewRequest flipped to false (independent)",
  after.notifyNewRequest === false,
  JSON.stringify(after));
record("3. notifyPayout flipped to false",
  after.notifyPayout === false,
  JSON.stringify(after));
record("3. notifyWeeklySummary flipped to true",
  after.notifyWeeklySummary === true,
  JSON.stringify(after));

// 4. DB row reflects the flips.
const dbRow = await prisma.riderProfile.findUnique({
  where: { userId: u.id },
  select: { notifyNewRequest: true, notifyPayout: true, notifyWeeklySummary: true },
});
record("4. DB RiderProfile row matches API",
  dbRow.notifyNewRequest === false &&
    dbRow.notifyPayout === false &&
    dbRow.notifyWeeklySummary === true,
  JSON.stringify(dbRow));

// 5. Validate rejects non-boolean.
for (const bad of [
  { notifyNewRequest: "yes" },
  { notifyPayout: 1 },
  { notifyWeeklySummary: null },
  { foo: "bar" },
  {},
]) {
  const res = await fetch(`${BASE}/api/riders/notification-preferences`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(bad),
  });
  record(`5. reject non-boolean ${JSON.stringify(bad)} → 400`,
    res.status === 400, `status=${res.status}`);
}

// 6. Refresh: log in again, re-fetch — values stay.
const login2 = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS, expectedRole: "RIDER" }),
});
const token2 = (await login2.json()).token;
const meAfter2 = await (await fetch(`${BASE}/api/riders/me`, { headers: { authorization: `Bearer ${token2}` } })).json();
record("6. refresh — values persist across re-login",
  meAfter2.rider.notifyNewRequest === false &&
    meAfter2.rider.notifyPayout === false &&
    meAfter2.rider.notifyWeeklySummary === true,
  JSON.stringify(meAfter2.rider));

// 7. Restore defaults so subsequent runs start clean.
await prisma.riderProfile.update({
  where: { userId: u.id },
  data: { notifyNewRequest: true, notifyPayout: true, notifyWeeklySummary: false },
});

await prisma.$disconnect();
console.log(`\n==== Toggle persistence: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
