// Bug 5 e2e: rider registration with a zone must NOT call the
// auth-gated PUT /api/riders/zone endpoint, and the zone must
// persist atomically with the rider row via POST
// /api/auth/register/rider.
//
// We hit the API directly (skipping the browser) because the
// bug surface is "no auth header on registration-time fetches".
//
// Steps:
//   1. Mint an EmailOtp for a fresh email.
//   2. POST /api/auth/register/rider with full payload INCLUDING
//      zone {lat, lng, address, radiusKm}.
//   3. Expect 201 + a fresh User + RiderProfile row with
//      zoneLat / zoneLng / zoneRadiusKm / zoneAddress populated.
//   4. Confirm no second PUT was needed (the zone is on the
//      RiderProfile from step 3 alone).
//   5. Sanity: /api/riders/zone PUT without auth header still
//      returns 401 (the dashboard route is unchanged).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let pass = 0, fail = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); pass++; }
  else { console.log("FAIL  " + msg); fail++; }
};

const probeEmail = `rider-zone-${Date.now()}@example.com`;
const probePhone = `+88017${String(Date.now()).slice(-8)}`;
const otp = "123456";
const otpHash = createHash("sha256").update(otp).digest("hex");
await prisma.emailOtp.create({
  data: {
    email: probeEmail.toLowerCase(),
    otpHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "REGISTRATION",
  },
});

// Dhaka — Tushardhara, Miragonjar (the address shown in the screenshot).
const zone = {
  lat: 23.7937,
  lng: 90.4043,
  address: "Tushardhara, Merajnagar, Dhaka",
  radiusKm: 5,
};

console.log(`Probe email=${probeEmail} phone=${probePhone}`);

// ---- POST register WITH zone --------------------------------------
const res = await fetch("http://localhost:4050/api/auth/register/rider", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Zone Test",
    email: probeEmail,
    password: "password123",
    phone: probePhone,
    vehicleType: "bike",
    vehicleRegNumber: "DHA-9999",
    otp,
    zone,
  }),
});
const text = await res.text();
console.log("STATUS:", res.status);
console.log("BODY:", text.slice(0, 250));
log(res.status === 201, "POST /api/auth/register/rider returns 201");

const body = JSON.parse(text);
const userId = body.user.id;
log(!!userId, "userId returned");

// Verify zone persisted on the RiderProfile.
const profile = await prisma.riderProfile.findUnique({ where: { userId } });
log(!!profile, "RiderProfile row exists");
log(profile?.zoneLat === zone.lat, `zoneLat === ${zone.lat} (got ${profile?.zoneLat})`);
log(profile?.zoneLng === zone.lng, `zoneLng === ${zone.lng} (got ${profile?.zoneLng})`);
log(profile?.zoneRadiusKm === 5, `zoneRadiusKm === 5 (got ${profile?.zoneRadiusKm})`);
log(profile?.zoneAddress === zone.address, `zoneAddress === "${zone.address}" (got "${profile?.zoneAddress}")`);

// ---- Sanity: /api/riders/zone PUT still 401 without auth ---------
const zonePutRes = await fetch("http://localhost:4050/api/riders/zone", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ lat: zone.lat, lng: zone.lng }),
});
const zonePutText = await zonePutRes.text();
console.log(`\nSanity: PUT /api/riders/zone (no auth) → ${zonePutRes.status}`);
log(zonePutRes.status === 401, "Unauthenticated PUT /api/riders/zone still returns 401 (dashboard auth unchanged)");
log(/Authorization/i.test(zonePutText), "401 body mentions Authorization");

// ---- Sanity: bogus lat/lng returns 400 ----------------------------
const probeEmail2 = `rider-badzone-${Date.now()}@example.com`;
const probePhone2 = `+88017${String(Date.now()).slice(-7)}1`;
const otpHash2 = createHash("sha256").update(otp).digest("hex");
await prisma.emailOtp.create({
  data: {
    email: probeEmail2.toLowerCase(),
    otpHash: otpHash2,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "REGISTRATION",
  },
});
const badRes = await fetch("http://localhost:4050/api/auth/register/rider", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Bad Zone",
    email: probeEmail2,
    password: "password123",
    phone: probePhone2,
    vehicleType: "bike",
    vehicleRegNumber: "DHA-1111",
    otp,
    zone: { lat: 999, lng: -999 },
  }),
});
console.log(`\nBad zone lat/lng → ${badRes.status}`);
log(badRes.status === 400, "Bogus zone (lat=999, lng=-999) returns 400");

// ---- Sanity: register WITHOUT zone still works (no zone persisted) -
const probeEmail3 = `rider-nozone-${Date.now()}@example.com`;
const probePhone3 = `+88017${String(Date.now()).slice(-7)}2`;
const otpHash3 = createHash("sha256").update(otp).digest("hex");
await prisma.emailOtp.create({
  data: {
    email: probeEmail3.toLowerCase(),
    otpHash: otpHash3,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "REGISTRATION",
  },
});
const noZoneRes = await fetch("http://localhost:4050/api/auth/register/rider", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "No Zone",
    email: probeEmail3,
    password: "password123",
    phone: probePhone3,
    vehicleType: "bike",
    vehicleRegNumber: "DHA-2222",
    otp,
  }),
});
console.log(`\nNo zone → ${noZoneRes.status}`);
log(noZoneRes.status === 201, "Register without zone still returns 201");
const noZoneBody = await noZoneRes.json();
const noZoneProfile = await prisma.riderProfile.findUnique({ where: { userId: noZoneBody.user.id } });
log(noZoneProfile?.zoneLat === null, "zoneLat is null when no zone sent");
log(noZoneProfile?.zoneLng === null, "zoneLng is null when no zone sent");

// Cleanup all probe rows.
const allEmails = [probeEmail, probeEmail2, probeEmail3];
for (const email of allEmails) {
  await prisma.riderProfile.deleteMany({ where: { user: { email } } });
  await prisma.emailOtp.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { email } });
}
await prisma.$disconnect();

console.log(`\nBug 5 e2e: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);