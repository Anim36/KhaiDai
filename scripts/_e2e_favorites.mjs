// End-to-end: the customer favorite flow.
//
//   1.  POST /api/favorites/[restaurantId]        → 201 (was 405 — root cause)
//   2.  GET  /api/favorites/[restaurantId]        → isFavorite: true
//   3.  GET  /api/favorites                       → list contains it, joined
//   4.  POST /api/favorites/[restaurantId] again  → 201 (idempotent)
//   5.  POST /api/favorites (body restaurantId)   → 201 (parent path still works)
//   6.  POST /api/favorites/UNKNOWN_ID            → 404
//   7.  DELETE /api/favorites/[restaurantId]      → 200
//   8.  GET  /api/favorites/[restaurantId]        → isFavorite: false
//   9.  DELETE again                              → 200 (idempotent)
//   10. Customer B cannot see Customer A's favorites
//   11. RIDER role gets 403 on all endpoints
//   12. Re-add after delete works (idempotent re-add)

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

async function api(token, path, init = {}) {
  const headers = { "content-type": "application/json", ...(init.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

// ------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------
const CUST_EMAIL = "customer-fav-e2e@khaidai.test";
const CUST_B_EMAIL = "customer-fav-e2e-b@khaidai.test";
const PART_EMAIL = "partner-fav-e2e@khaidai.test";
const RIDER_EMAIL = "rider-fav-e2e@khaidai.test";

await ensureUser(CUST_EMAIL, "CUSTOMER", "Fav E2E Customer A");
await ensureUser(CUST_B_EMAIL, "CUSTOMER", "Fav E2E Customer B");
await ensureUser(PART_EMAIL, "PARTNER", "Fav E2E Partner");
await ensureUser(RIDER_EMAIL, "RIDER", "Fav E2E Rider");

const partner = await prisma.user.findUnique({ where: { email: PART_EMAIL } });

const REST_NAME = `Fav E2E Resto ${Date.now()}`;
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
console.log(`Created restaurant "${REST_NAME}" (id=${restaurant.id})`);

// Wipe any leftover favorites for these users on this restaurant so the
// test starts from a clean slate.
const custA = await prisma.user.findUnique({ where: { email: CUST_EMAIL } });
const custB = await prisma.user.findUnique({ where: { email: CUST_B_EMAIL } });
await prisma.favorite.deleteMany({
  where: { restaurantId: restaurant.id, userId: { in: [custA.id, custB.id] } },
});

const tokenA = await login(CUST_EMAIL, "CUSTOMER");
const tokenB = await login(CUST_B_EMAIL, "CUSTOMER");
const tokenRider = await login(RIDER_EMAIL, "RIDER");

// ------------------------------------------------------------------
// 1. POST /api/favorites/[restaurantId] → 201  (THE BUG)
// ------------------------------------------------------------------
const addRes = await api(tokenA, `/api/favorites/${restaurant.id}`, {
  method: "POST",
});
const addJson = await addRes.json().catch(() => ({}));
record(
  "POST /api/favorites/{id} returns 201",
  addRes.status === 201,
  `status=${addRes.status} body=${JSON.stringify(addJson)}`,
);

// ------------------------------------------------------------------
// 2. GET /api/favorites/[restaurantId] → isFavorite: true
// ------------------------------------------------------------------
const isFavRes = await api(tokenA, `/api/favorites/${restaurant.id}`);
const isFavJson = await isFavRes.json().catch(() => ({}));
record(
  "GET /api/favorites/{id} returns isFavorite: true",
  isFavRes.status === 200 && isFavJson.isFavorite === true,
  `status=${isFavRes.status} body=${JSON.stringify(isFavJson)}`,
);

// ------------------------------------------------------------------
// 3. GET /api/favorites → list contains joined restaurant
// ------------------------------------------------------------------
const listRes = await api(tokenA, `/api/favorites`);
const listJson = await listRes.json().catch(() => ({}));
const list = Array.isArray(listJson.favorites) ? listJson.favorites : [];
const entry = list.find((f) => f.restaurantId === restaurant.id);
record(
  "GET /api/favorites list contains the favorite",
  listRes.status === 200 && entry !== undefined,
  `status=${listRes.status} count=${list.length}`,
);
record(
  "List entry has joined restaurant.name",
  entry !== undefined && entry.restaurant?.name === REST_NAME,
  `got name=${entry?.restaurant?.name}`,
);
record(
  "List entry has joined restaurant.coverImage (string)",
  entry !== undefined && (entry.restaurant?.coverImage === null || typeof entry.restaurant?.coverImage === "string"),
  `coverImage=${entry?.restaurant?.coverImage}`,
);
record(
  "List entry has numeric restaurant.rating",
  entry !== undefined && typeof entry.restaurant?.rating === "number",
  `rating=${entry?.restaurant?.rating}`,
);

// ------------------------------------------------------------------
// 4. Idempotency: re-POST same restaurant → still 201 (no 409 / 500)
// ------------------------------------------------------------------
const reAdd = await api(tokenA, `/api/favorites/${restaurant.id}`, { method: "POST" });
const reAddJson = await reAdd.json().catch(() => ({}));
record(
  "Re-POST /api/favorites/{id} is idempotent (still 201)",
  reAdd.status === 201,
  `status=${reAdd.status} body=${JSON.stringify(reAddJson)}`,
);

// ------------------------------------------------------------------
// 5. Parent POST /api/favorites still works with body restaurantId
// ------------------------------------------------------------------
// First delete so the second POST path is exercised from a clean state.
await api(tokenA, `/api/favorites/${restaurant.id}`, { method: "DELETE" });
const parentAdd = await api(tokenA, `/api/favorites`, {
  method: "POST",
  body: JSON.stringify({ restaurantId: restaurant.id }),
});
const parentAddJson = await parentAdd.json().catch(() => ({}));
record(
  "POST /api/favorites with body { restaurantId } returns 201",
  parentAdd.status === 201 && parentAddJson.favorite?.restaurantId === restaurant.id,
  `status=${parentAdd.status} body=${JSON.stringify(parentAddJson)}`,
);

// ------------------------------------------------------------------
// 6. POST unknown restaurantId → 404
// ------------------------------------------------------------------
const fakeId = "cm_nonexistent_fav_e2e_does_not_exist";
const notFound = await api(tokenA, `/api/favorites/${fakeId}`, { method: "POST" });
record(
  "POST /api/favorites/{unknown} returns 404",
  notFound.status === 404,
  `status=${notFound.status}`,
);

// ------------------------------------------------------------------
// 7. DELETE /api/favorites/[restaurantId] → 200
// ------------------------------------------------------------------
const del = await api(tokenA, `/api/favorites/${restaurant.id}`, { method: "DELETE" });
const delJson = await del.json().catch(() => ({}));
record(
  "DELETE /api/favorites/{id} returns 200",
  del.status === 200 && delJson.ok === true,
  `status=${del.status} body=${JSON.stringify(delJson)}`,
);

// ------------------------------------------------------------------
// 8. After delete, GET single returns isFavorite: false
// ------------------------------------------------------------------
const afterDelRes = await api(tokenA, `/api/favorites/${restaurant.id}`);
const afterDelJson = await afterDelRes.json().catch(() => ({}));
record(
  "After delete, GET /api/favorites/{id} returns isFavorite: false",
  afterDelRes.status === 200 && afterDelJson.isFavorite === false,
  `status=${afterDelRes.status} body=${JSON.stringify(afterDelJson)}`,
);

// ------------------------------------------------------------------
// 9. DELETE again is idempotent
// ------------------------------------------------------------------
const delAgain = await api(tokenA, `/api/favorites/${restaurant.id}`, { method: "DELETE" });
record(
  "Second DELETE is idempotent (200)",
  delAgain.status === 200,
  `status=${delAgain.status}`,
);

// ------------------------------------------------------------------
// 10. Re-add after delete works (idempotent re-add)
// ------------------------------------------------------------------
const reAddAfterDel = await api(tokenA, `/api/favorites/${restaurant.id}`, { method: "POST" });
const reAddAfterDelJson = await reAddAfterDel.json().catch(() => ({}));
record(
  "Re-POST after delete returns 201",
  reAddAfterDel.status === 201 && reAddAfterDelJson.favorite?.restaurantId === restaurant.id,
  `status=${reAddAfterDel.status} body=${JSON.stringify(reAddAfterDelJson)}`,
);

// ------------------------------------------------------------------
// 11. Cross-tenant: Customer B cannot see Customer A's favorite
// ------------------------------------------------------------------
const listBRes = await api(tokenB, `/api/favorites`);
const listBJson = await listBRes.json().catch(() => ({}));
const listB = Array.isArray(listBJson.favorites) ? listBJson.favorites : [];
const leaked = listB.find((f) => f.restaurantId === restaurant.id);
record(
  "Customer B does NOT see Customer A's favorite",
  listBRes.status === 200 && leaked === undefined,
  `status=${listBRes.status} leaked=${leaked !== undefined}`,
);
const isFavBRes = await api(tokenB, `/api/favorites/${restaurant.id}`);
const isFavBJson = await isFavBRes.json().catch(() => ({}));
record(
  "GET /api/favorites/{id} scoped to caller (Customer B sees false)",
  isFavBRes.status === 200 && isFavBJson.isFavorite === false,
  `status=${isFavBRes.status} body=${JSON.stringify(isFavBJson)}`,
);

// ------------------------------------------------------------------
// 12. RIDER role gets 403 on POST/GET/DELETE
// ------------------------------------------------------------------
const riderPost = await api(tokenRider, `/api/favorites/${restaurant.id}`, { method: "POST" });
const riderGet = await api(tokenRider, `/api/favorites`);
const riderDel = await api(tokenRider, `/api/favorites/${restaurant.id}`, { method: "DELETE" });
record(
  "RIDER POST → 403",
  riderPost.status === 403,
  `status=${riderPost.status}`,
);
record(
  "RIDER GET list → 403",
  riderGet.status === 403,
  `status=${riderGet.status}`,
);
record(
  "RIDER DELETE → 403",
  riderDel.status === 403,
  `status=${riderDel.status}`,
);

// ------------------------------------------------------------------
// 13. Unauthenticated request → 401
// ------------------------------------------------------------------
const anon = await fetch(`${BASE}/api/favorites`);
record(
  "Anonymous GET /api/favorites → 401",
  anon.status === 401,
  `status=${anon.status}`,
);

// ------------------------------------------------------------------
// Cleanup so re-running the test starts clean
// ------------------------------------------------------------------
await prisma.favorite.deleteMany({ where: { restaurantId: restaurant.id } });
await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});

console.log("\n================================================");
console.log(`FAVORITES E2E: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);