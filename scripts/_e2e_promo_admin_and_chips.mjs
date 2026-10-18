// End-to-end checks for কাজ ৪ (restaurant promo chips) +
// কাজ ৫ (admin promo-code creation).
//
// কাজ ৪:
//   • POST /api/promo-codes (partner) creates a restaurant-scoped code.
//   • GET /api/restaurants/[id] returns that code under `promoCodes`.
//   • GET /api/restaurants/[id] also returns `isAcceptingOrders`.
//
// কাজ ৫:
//   • POST /api/admin/promo-codes creates a platform-wide code as admin.
//   • customer + partner → 403.
//   • duplicate code → 409.
//   • GET /api/promo-codes/active shows the new platform-wide code.
//   • GET /api/admin/promo-codes shows both partner + platform rows.
//   • AuditLog entry exists for the admin create.
//
// Uses Prisma to seed + clean up its own rows so it doesn't pollute
// the catalogue. Runs against http://localhost:3000 (matches the
// dev server I bring up for smoke tests).

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
        name: name ?? `${role} e2e promo`,
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

// -------- seed -----------------------------------------------------
const PART_EMAIL = `partner-promo-e2e-${Date.now()}@khaidai.test`;
const ADMIN_EMAIL = `admin-promo-e2e-${Date.now()}@khaidai.test`;
const CUST_EMAIL = `cust-promo-e2e-${Date.now()}@khaidai.test`;
await ensureUser(PART_EMAIL, "PARTNER", "Promo E2E Partner");
await ensureUser(ADMIN_EMAIL, "ADMIN", "Promo E2E Admin");
await ensureUser(CUST_EMAIL, "CUSTOMER", "Promo E2E Customer");

const partner = await prisma.user.findUnique({ where: { email: PART_EMAIL } });
const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

const restaurant = await prisma.restaurant.create({
  data: {
    ownerId: partner.id,
    name: `Promo E2E Rest ${Date.now()}`,
    address: "Promo E2E Addr",
    latitude: 23.78,
    longitude: 90.4,
    cuisine: "Test",
    deliveryTime: 30,
    deliveryFee: 50,
  },
});

const partnerToken = await login(PART_EMAIL, "PARTNER");
const adminToken = await login(ADMIN_EMAIL, "ADMIN");
const customerToken = await login(CUST_EMAIL, "CUSTOMER");

// -------- কাজ ৪: partner creates a restaurant-scoped code ----------
const partnerCode = `E2EP${Date.now()}`;
const partnerCreate = await fetch(`${BASE}/api/partner/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({
    code: partnerCode,
    discountType: "PERCENTAGE",
    discountValue: 15,
    minOrderAmount: 200,
    description: "Save 15% on orders above ৳200",
  }),
});
const partnerCreateJson = await partnerCreate.json().catch(() => ({}));
record(
  "POST /api/partner/promo-codes creates a restaurant-scoped code",
  partnerCreate.status === 201 && partnerCreateJson.code?.code === partnerCode,
  `status=${partnerCreate.status} body=${JSON.stringify(partnerCreateJson)}`,
);

// GET /api/restaurants/[id] surfaces it under promoCodes
const detail = await fetch(`${BASE}/api/restaurants/${restaurant.id}`);
const detailJson = await detail.json().catch(() => ({}));
const promos = detailJson.restaurant?.promoCodes ?? [];
record(
  "GET /api/restaurants/[id] includes partner-created promo",
  Array.isArray(promos) && promos.some((p) => p.code === partnerCode),
  `promos=${JSON.stringify(promos.map((p) => p.code))}`,
);
record(
  "GET /api/restaurants/[id] surfaces isAcceptingOrders",
  typeof detailJson.restaurant?.isAcceptingOrders === "boolean",
  `isAcceptingOrders=${detailJson.restaurant?.isAcceptingOrders}`,
);
record(
  "Partner promo carries the description in the chip payload",
  promos.find((p) => p.code === partnerCode)?.description === "Save 15% on orders above ৳200",
  `desc=${promos.find((p) => p.code === partnerCode)?.description}`,
);

// -------- কাজ ৫: admin creates a platform-wide code --------------
const adminCode = `E2EA${Date.now()}`;
const adminCreate = await fetch(`${BASE}/api/admin/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({
    code: adminCode,
    discountType: "FIXED",
    discountValue: 50,
    description: "Flat ৳50 off for everyone",
    usageLimit: 100,
  }),
});
const adminCreateJson = await adminCreate.json().catch(() => ({}));
record(
  "POST /api/admin/promo-codes creates a platform-wide code",
  adminCreate.status === 201 && adminCreateJson.code?.code === adminCode,
  `status=${adminCreate.status} body=${JSON.stringify(adminCreateJson)}`,
);
record(
  "Admin-created code has createdByPartner=false",
  adminCreateJson.code?.createdByPartner === false,
  `createdByPartner=${adminCreateJson.code?.createdByPartner}`,
);
record(
  "Admin-created code has restaurantId=null (platform-wide)",
  adminCreateJson.code?.restaurantId === null,
  `restaurantId=${adminCreateJson.code?.restaurantId}`,
);

// Wrong role → 403
const forbidden1 = await fetch(`${BASE}/api/admin/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${partnerToken}` },
  body: JSON.stringify({ code: `WRONG1${Date.now()}`, discountType: "FIXED", discountValue: 10 }),
});
record(
  "Partner → POST /api/admin/promo-codes returns 403",
  forbidden1.status === 403,
  `status=${forbidden1.status}`,
);

const forbidden2 = await fetch(`${BASE}/api/admin/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${customerToken}` },
  body: JSON.stringify({ code: `WRONG2${Date.now()}`, discountType: "FIXED", discountValue: 10 }),
});
record(
  "Customer → POST /api/admin/promo-codes returns 403",
  forbidden2.status === 403,
  `status=${forbidden2.status}`,
);

// Duplicate code → 409
const dup = await fetch(`${BASE}/api/admin/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({
    code: adminCode,
    discountType: "FIXED",
    discountValue: 10,
  }),
});
record(
  "Duplicate admin code returns 409",
  dup.status === 409,
  `status=${dup.status}`,
);

// Validation errors
const invalid = await fetch(`${BASE}/api/admin/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ code: "ok", discountType: "PERCENTAGE", discountValue: 200 }),
});
const invalidJson = await invalid.json().catch(() => ({}));
record(
  "PERCENTAGE > 100 rejected with 400",
  invalid.status === 400 && /100|percent/i.test(invalidJson.error ?? ""),
  `status=${invalid.status} err=${invalidJson.error}`,
);

const invalidChars = await fetch(`${BASE}/api/admin/promo-codes`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ code: "lower case!", discountType: "PERCENTAGE", discountValue: 10 }),
});
record(
  "Lowercase / non-alphanum code rejected with 400",
  invalidChars.status === 400,
  `status=${invalidChars.status}`,
);

// Active feed includes the new platform code (admin path)
const active = await fetch(`${BASE}/api/promo-codes/active`);
const activeJson = await active.json().catch(() => ({}));
record(
  "GET /api/promo-codes/active surfaces the admin-created platform code",
  Array.isArray(activeJson.promos) && activeJson.promos.some((p) => p.code === adminCode),
  `codes=${JSON.stringify((activeJson.promos ?? []).map((p) => p.code))}`,
);

// Admin list also sees both codes
const adminList = await fetch(`${BASE}/api/admin/promo-codes`, {
  headers: { authorization: `Bearer ${adminToken}` },
});
const adminListJson = await adminList.json().catch(() => ({}));
record(
  "GET /api/admin/promo-codes lists both partner + admin codes",
  Array.isArray(adminListJson.codes) &&
    adminListJson.codes.some((c) => c.code === partnerCode) &&
    adminListJson.codes.some((c) => c.code === adminCode),
  `codes=${JSON.stringify((adminListJson.codes ?? []).map((c) => c.code))}`,
);

// AuditLog entry for the admin create
const auditRow = await prisma.auditLog.findFirst({
  where: { action: "PROMO_CODE_CREATED", entityId: adminCreateJson.code?.id },
});
record(
  "AuditLog carries PROMO_CODE_CREATED for the admin create",
  auditRow !== null,
  `auditRow=${auditRow?.id}`,
);

// -------- cleanup ------------------------------------------------
await prisma.auditLog.deleteMany({
  where: { action: "PROMO_CODE_CREATED", entityId: adminCreateJson.code?.id },
});
await prisma.promoCode.deleteMany({
  where: { code: { in: [partnerCode, adminCode] } },
});
await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});

console.log("\n================================================");
console.log(`PROMO ADMIN + CHIPS E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);