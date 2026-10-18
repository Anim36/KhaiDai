// scripts/_e2e_zone_picker.mjs
//
// End-to-end test for the Rider Service Zone picker upgrades:
//
//   1. Server-side: /api/riders/zone PUT forces radiusKm = 5 even
//      when the client sends a different value (defense in depth).
//   2. Server-side: /api/riders/zone PUT validates lat/lng ranges
//      and rejects bad input with 400.
//   3. Server-side: /api/riders/zone PUT normalises a missing
//      address to "lat, lng" rather than storing NULL.
//   4. Registration flow: rider signs up, then PUTs the zone, the
//      dashboard GET returns the saved zone — so the rider lands
//      on the dashboard with the blocking modal gone.
//   5. Admin route /api/admin/riders/[id] PATCH also forces
//      radiusKm = 5.
//   6. Negative: a Customer (or unauthenticated) cannot save a zone
//      for someone else.

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
      data: { email, name: `${role} zone`, role, password: hash, phone: randPhone() },
    });
  }
  if (role === "RIDER") {
    // The /api/riders/zone route requires a RiderProfile row
    // to exist for the signed-in user. Tests create users
    // out-of-band, so we upsert the profile here.
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

const RIDER_EMAIL = "rider-zone-picker@khaidai.test";
const ADMIN_EMAIL = "admin-zone-picker@khaidai.test";

await ensureUser(RIDER_EMAIL, "RIDER");
const riderUser = await prisma.user.findUnique({ where: { email: RIDER_EMAIL } });

await ensureUser(ADMIN_EMAIL, "ADMIN");
const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

const riderToken = await login(RIDER_EMAIL, "RIDER");
const adminToken = await login(ADMIN_EMAIL, "ADMIN");

// --- 1. /api/riders/zone PUT forces radiusKm = 5 ---
const PUT_URL = `${BASE}/api/riders/zone`;

const putRes = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({
    lat: 23.8103,
    lng: 90.4125,
    address: "Dhanmondi, Dhaka",
    radiusKm: 99, // client tries to be sneaky
  }),
});
const putJ = await putRes.json();
record("1a. PUT /api/riders/zone returns 200",
  putRes.status === 200, `status=${putRes.status} body=${JSON.stringify(putJ).slice(0, 200)}`);
record("1b. server stored radiusKm = 5 (ignored client 99)",
  putJ.zone?.radiusKm === 5, `radiusKm=${putJ.zone?.radiusKm}`);

// Confirm in DB
const profileAfterPut = await prisma.riderProfile.findUnique({ where: { userId: riderUser.id } });
record("1c. DB row has zoneRadiusKm = 5",
  profileAfterPut?.zoneRadiusKm === 5,
  `db.zoneRadiusKm=${profileAfterPut?.zoneRadiusKm}`);
record("1d. DB row has zoneAddress set",
  profileAfterPut?.zoneAddress === "Dhanmondi, Dhaka",
  `db.zoneAddress=${profileAfterPut?.zoneAddress}`);
record("1e. DB row has zoneLat = 23.8103",
  profileAfterPut?.zoneLat === 23.8103,
  `db.zoneLat=${profileAfterPut?.zoneLat}`);
record("1f. DB row has zoneLng = 90.4125",
  profileAfterPut?.zoneLng === 90.4125,
  `db.zoneLng=${profileAfterPut?.zoneLng}`);

// --- 2. PUT with bad input ---
const bad1 = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ lat: 999, lng: 90, address: "Bad", radiusKm: 5 }),
});
record("2a. PUT with out-of-range lat → 400",
  bad1.status === 400, `status=${bad1.status}`);

const bad2 = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ lat: 0, lng: 0, address: "Zero", radiusKm: 5 }),
});
record("2b. PUT with (0,0) lat/lng → 400",
  bad2.status === 400, `status=${bad2.status}`);

const bad3 = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ lat: "abc", lng: 90, address: "Type" }),
});
record("2c. PUT with non-number lat → 400",
  bad3.status === 400, `status=${bad3.status}`);

// --- 3. Missing address → fallback "lat, lng" string ---
const noAddr = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
  body: JSON.stringify({ lat: 23.71, lng: 90.40, radiusKm: 5 }),
});
const noAddrJ = await noAddr.json();
record("3a. PUT without address → 200 + fallback address",
  noAddr.status === 200 && typeof noAddrJ.zone?.address === "string" && noAddrJ.zone.address.includes("23.71"),
  `address=${noAddrJ.zone?.address}`);

// --- 4. Registration flow -> PUT zone -> dashboard GET returns zone ---
const REG_EMAIL = "rider-zone-pick-new@khaidai.test";

// Clean up any previous run.
const existing = await prisma.user.findUnique({ where: { email: REG_EMAIL } });
if (existing) {
  const prof = await prisma.riderProfile.findUnique({ where: { userId: existing.id } });
  if (prof) await prisma.riderProfile.delete({ where: { id: prof.id } });
  await prisma.user.delete({ where: { id: existing.id } });
}

const regRes = await fetch(`${BASE}/api/auth/register/rider`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Zone Pick Reg",
    email: REG_EMAIL,
    password: "khaidai1234",
    phone: randPhone(),
    vehicleType: "bike",
    vehicleRegNumber: "DHA-ZP-9999",
  }),
});
const regJ = await regRes.json();
record("4a. POST /api/auth/register/rider → 201",
  regRes.status === 201, `status=${regRes.status} body=${JSON.stringify(regJ).slice(0, 200)}`);

const newUser = await prisma.user.findUnique({ where: { email: REG_EMAIL } });
const newRiderToken = regJ.token;

// New rider should have NO zone yet.
const meNoZone = await fetch(`${BASE}/api/riders/me`, {
  headers: { authorization: `Bearer ${newRiderToken}` },
});
const meNoZoneJ = await meNoZone.json();
record("4b. /api/riders/me → zone null before zone save",
  meNoZoneJ?.rider?.zone === null,
  `zone=${JSON.stringify(meNoZoneJ?.rider?.zone)}`);

// Save zone.
const saveZoneRes = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${newRiderToken}` },
  body: JSON.stringify({
    lat: 23.8069,
    lng: 90.3687,
    address: "Mirpur 10, Dhaka",
    radiusKm: 5,
  }),
});
const saveZoneJ = await saveZoneRes.json();
record("4c. PUT /api/riders/zone (post-register) → 200",
  saveZoneRes.status === 200 && saveZoneJ.zone?.radiusKm === 5,
  `status=${saveZoneRes.status} radiusKm=${saveZoneJ.zone?.radiusKm}`);

// Dashboard /me now returns the zone.
const meWithZone = await fetch(`${BASE}/api/riders/me`, {
  headers: { authorization: `Bearer ${newRiderToken}` },
});
const meWithZoneJ = await meWithZone.json();
record("4d. /api/riders/me → zone populated after save",
  meWithZoneJ?.rider?.zone?.radiusKm === 5 && meWithZoneJ?.rider?.zone?.lat === 23.8069,
  `zone=${JSON.stringify(meWithZoneJ?.rider?.zone)}`);

// The dashboard would no longer show the blocking modal.
record("4e. Dashboard should NOT show blocking modal (zone present)",
  meWithZoneJ?.rider?.zone !== null,
  `zone=${JSON.stringify(meWithZoneJ?.rider?.zone)}`);

// --- 5. Admin route PATCH also forces radiusKm = 5 ---
const adminPatch = await fetch(`${BASE}/api/admin/riders/${newUser.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({
    lat: 23.75,
    lng: 90.40,
    address: "Admin-set zone",
    radiusKm: 50, // client tries to be sneaky
  }),
});
const adminPatchJ = await adminPatch.json();
record("5a. Admin PATCH zone returns 200",
  adminPatch.status === 200, `status=${adminPatch.status}`);
record("5b. Admin PATCH forced radiusKm = 5 (ignored client 50)",
  adminPatchJ.zone?.radiusKm === 5,
  `radiusKm=${adminPatchJ.zone?.radiusKm}`);

// --- 6. Negative: customer (wrong role) cannot save a zone ---
const CUSTOMER_EMAIL = "customer-zone-picker@khaidai.test";
await ensureUser(CUSTOMER_EMAIL, "CUSTOMER");
const customerToken = await login(CUSTOMER_EMAIL, "CUSTOMER");
const customerPut = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({ lat: 23.81, lng: 90.41, radiusKm: 5 }),
});
record("6a. Customer PUT /api/riders/zone → 403",
  customerPut.status === 403, `status=${customerPut.status}`);

// Unauthenticated request.
const anonPut = await fetch(PUT_URL, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ lat: 23.81, lng: 90.41, radiusKm: 5 }),
});
record("6b. Unauthenticated PUT /api/riders/zone → 401",
  anonPut.status === 401, `status=${anonPut.status}`);

await prisma.$disconnect();
console.log(`\n==== Zone picker e2e: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
