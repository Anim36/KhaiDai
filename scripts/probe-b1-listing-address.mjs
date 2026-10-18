// scripts/probe-b1-listing-address.mjs
//
// B1 — verify GET /api/restaurants (listing) includes the
// `address` field on every returned restaurant, matching the
// shape of /api/restaurants/[id].

import "dotenv/config";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";

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

const customerToken = await login({
  email: "sslcz.customer@example.com",
  password: "Pa55word!",
  expectedRole: "CUSTOMER",
});

// ---- listing ---------------------------------------------------------
const listResp = await fetch(`${BASE}/api/restaurants`, {
  headers: { authorization: `Bearer ${customerToken}` },
});
check("GET /api/restaurants returns 200", listResp.status === 200, `status=${listResp.status}`);
const listJson = await listResp.json();
const restaurants = listJson?.restaurants ?? [];
check("restaurants list non-empty", restaurants.length > 0, `n=${restaurants.length}`);

const everyHasAddress = restaurants.every((r) => typeof r.address === "string" && r.address.length > 0);
check(
  "every listing row has non-empty `address`",
  everyHasAddress,
  `sample=${JSON.stringify(restaurants[0]?.address)}`,
);

// ---- detail cross-check --------------------------------------------
const detailResp = await fetch(`${BASE}/api/restaurants/${restaurants[0].id}`, {
  headers: { authorization: `Bearer ${customerToken}` },
});
const detailJson = await detailResp.json();
check(
  "listing address === detail address (first row)",
  restaurants[0]?.address === detailJson?.restaurant?.address,
  `listing="${restaurants[0]?.address}" detail="${detailJson?.restaurant?.address}"`,
);

// ---- raw DB cross-check --------------------------------------------
// Ensure the address actually round-trips from the DB column, not
// just some hardcoded value.
const r = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "sslcz.partner@example.com",
    password: "Pa55word!",
    expectedRole: "PARTNER",
  }),
});
const partnerToken = (await r.json()).token;

// Use partner's own /api/restaurants/me to confirm the DB has
// the same address (sanity check that we're not echoing a stale
// fixture somewhere).
const myResp = await fetch(`${BASE}/api/restaurants/me`, {
  headers: { authorization: `Bearer ${partnerToken}` },
});
const myJson = await myResp.json();
check(
  "partner's own /me address matches listing",
  myJson?.restaurant?.address === restaurants.find((x) => x.id === myJson.restaurant.id)?.address,
  `me="${myJson?.restaurant?.address}" listing="${restaurants.find((x) => x.id === myJson.restaurant.id)?.address}"`,
);

console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);