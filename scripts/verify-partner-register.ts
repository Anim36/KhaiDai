/**
 * Regression test for the Partner registration address picker bug.
 *
 * What it proves:
 *   1. The real `/api/auth/register/partner` route accepts a
 *      `restaurant.latitude` / `restaurant.longitude` pair that
 *      mirrors what the registration form's AddressPicker writes
 *      into React state.
 *   2. The freshly-created `Restaurant` row in Postgres carries
 *      those coordinates (not null), which is what the customer
 *      listing's distance filter relies on.
 *   3. When the restaurant block is sent WITHOUT lat/lng, the
 *      row is still created (with nulls) — the lat/lng are not
 *      enforced on the server, only the picker's local validation
 *      gates the UI.
 *   4. When the restaurant block is sent with a half-pair (lat
 *      but no lng), the route refuses with 400 — the new
 *      "must be provided together" check.
 *
 * Hygiene:
 *   - Every test row uses a `partner.regprobe.<ts>@example.com`
 *     prefix so it can never collide with real partner accounts.
 *   - At the end (success OR failure) we delete the seeded users +
 *     restaurants + EmailOtp rows so the DB stays clean.
 *
 * Run with: npx tsx scripts/verify-partner-register.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const BASE = "http://localhost:3000";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, info?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, info ?? "");
  }
}

async function mintOtpRow(email: string, plain: string) {
  await prisma.emailOtp.deleteMany({ where: { email } });
  await prisma.emailOtp.create({
    data: {
      email,
      otpHash: hashOtp(plain),
      purpose: "REGISTRATION",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

async function cleanup(email: string) {
  // Order matters: Restaurant → PartnerProfile → User.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const restaurants = await prisma.restaurant.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });
    if (restaurants.length) {
      await prisma.restaurantDocument.deleteMany({
        where: { restaurantId: { in: restaurants.map((r) => r.id) } },
      });
      await prisma.restaurant.deleteMany({
        where: { id: { in: restaurants.map((r) => r.id) } },
      });
    }
    await prisma.partnerProfile.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.emailOtp.deleteMany({ where: { email } });
}

async function registerPartner(opts: {
  email: string;
  otp: string;
  restaurant?: Record<string, unknown>;
}) {
  return fetch(`${BASE}/api/auth/register/partner`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Probe Owner",
      email: opts.email,
      password: "partnerPass1!",
      phone: "+8801711000099",
      otp: opts.otp,
      restaurant: opts.restaurant,
    }),
  });
}

async function main() {
  const ts = Date.now();

  /* ============================================================== */
  /* Case 1 — restaurant WITH lat/lng (the fix).                     */
  /* ============================================================== */
  console.log("\n== Case 1: restaurant with latitude/longitude ==");
  const e1 = `partner.regprobe.case1.${ts}@example.com`;
  const otp1 = "111111";
  await mintOtpRow(e1, otp1);

  const r1 = await registerPartner({
    email: e1,
    otp: otp1,
    restaurant: {
      name: "Probe Bistro",
      address: "Dhanmondi, Dhaka",
      cuisine: "bangladeshi",
      latitude: 23.7461,
      longitude: 90.3742,
    },
  });
  const b1 = await r1.json();
  check("register returns 201", r1.status === 201, b1);
  check(
    "response includes restaurantId",
    typeof b1.restaurantId === "string",
    b1,
  );

  const u1 = await prisma.user.findUnique({ where: { email: e1 } });
  const rest1 = await prisma.restaurant.findFirst({
    where: { ownerId: u1?.id },
  });
  check("Restaurant row exists", rest1 !== null);
  check(
    "Restaurant.latitude persisted",
    rest1?.latitude === 23.7461,
    rest1?.latitude,
  );
  check(
    "Restaurant.longitude persisted",
    rest1?.longitude === 90.3742,
    rest1?.longitude,
  );

  await cleanup(e1);

  /* ============================================================== */
  /* Case 2 — restaurant WITHOUT lat/lng (still works).              */
  /* ============================================================== */
  console.log("\n== Case 2: restaurant without lat/lng ==");
  const e2 = `partner.regprobe.case2.${ts}@example.com`;
  const otp2 = "222222";
  await mintOtpRow(e2, otp2);

  const r2 = await registerPartner({
    email: e2,
    otp: otp2,
    restaurant: {
      name: "Probe Cafe",
      address: "Gulshan 2, Dhaka",
      cuisine: "burgers",
    },
  });
  const b2 = await r2.json();
  check("register returns 201", r2.status === 201, b2);

  const u2 = await prisma.user.findUnique({ where: { email: e2 } });
  const rest2 = await prisma.restaurant.findFirst({
    where: { ownerId: u2?.id },
  });
  check("Restaurant row exists", rest2 !== null);
  check("Restaurant.latitude is null", rest2?.latitude === null);
  check("Restaurant.longitude is null", rest2?.longitude === null);

  await cleanup(e2);

  /* ============================================================== */
  /* Case 3 — half-pair (lat only) must 400.                         */
  /* ============================================================== */
  console.log("\n== Case 3: lat without lng ==");
  const e3 = `partner.regprobe.case3.${ts}@example.com`;
  const otp3 = "333333";
  await mintOtpRow(e3, otp3);

  const r3 = await registerPartner({
    email: e3,
    otp: otp3,
    restaurant: {
      name: "Probe Half",
      address: "Banani, Dhaka",
      cuisine: "indian",
      latitude: 23.7937,
    },
  });
  const b3 = await r3.json();
  check("register returns 400", r3.status === 400, b3);
  check(
    "error message names both fields",
    /latitude/i.test(b3.error ?? "") && /longitude/i.test(b3.error ?? ""),
    b3.error,
  );

  // Should NOT have created a User or Restaurant — verify.
  const u3 = await prisma.user.findUnique({ where: { email: e3 } });
  check("no User row created (validation happens before OTP consume?)", u3 === null);
  await cleanup(e3);

  /* ============================================================== */
  /* Case 4 — out-of-range lat must 400.                             */
  /* ============================================================== */
  console.log("\n== Case 4: out-of-range lat ==");
  const e4 = `partner.regprobe.case4.${ts}@example.com`;
  const otp4 = "444444";
  await mintOtpRow(e4, otp4);

  const r4 = await registerPartner({
    email: e4,
    otp: otp4,
    restaurant: {
      name: "Probe OutOfRange",
      address: "Mars Colony 1",
      cuisine: "other",
      latitude: 999,
      longitude: 0,
    },
  });
  const b4 = await r4.json();
  check("register returns 400", r4.status === 400, b4);
  check(
    "error mentions out of range",
    /out of range/i.test(b4.error ?? ""),
    b4.error,
  );

  const u4 = await prisma.user.findUnique({ where: { email: e4 } });
  check("no User row created", u4 === null);
  await cleanup(e4);

  /* ============================================================== */
  console.log("\n========================================");
  console.log(`pass: ${pass}, fail: ${fail}`);
  console.log("========================================\n");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});