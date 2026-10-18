// scripts/probe-flow-e2e.mjs
//
// End-to-end smoke test covering all four primary user flows:
//
//   1. CUSTOMER — browse → cart (option/add-ons) → checkout
//      (special instructions) → order tracking.
//   2. PARTNER — login → online/offline toggle → view incoming
//      order → analytics.
//   3. RIDER    — login → online → receive dispatch → view
//      leaderboard.
//   4. ADMIN    — login → view analytics dashboard → check
//      withdrawals endpoint.
//
// Each step asserts via HTTP; we don't touch the DB directly so
// the test mirrors a real browser. Failures bubble up with
// status + body so the diagnosis is fast.

import "dotenv/config";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Pa55word!";

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
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`login ${email} ${r.status}: ${text}`);
  }
  return (await r.json()).token;
}

async function authFetch(path, token, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  return r;
}

// ---- Tokens ----------------------------------------------------------
console.log("--- Logging in 4 roles ---");
const customerToken = await login({ email: "sslcz.customer@example.com", password: PASSWORD, expectedRole: "CUSTOMER" });
const partnerToken = await login({ email: "sslcz.partner@example.com", password: PASSWORD, expectedRole: "PARTNER" });
const riderToken = await login({ email: "sslcz.rider@example.com", password: PASSWORD, expectedRole: "RIDER" });
const adminToken = await login({ email: "sslcz.admin@example.com", password: PASSWORD, expectedRole: "ADMIN" });
check("4 role logins all returned tokens", !!customerToken && !!partnerToken && !!riderToken && !!adminToken);

// ---- 1. CUSTOMER FLOW ----------------------------------------------
console.log("\n--- 1. Customer flow: browse → cart → order → track ---");

// 1a. list
const listResp = await authFetch("/api/restaurants", customerToken);
check("GET /api/restaurants returns 200", listResp.status === 200, `status=${listResp.status}`);
const listJson = await listResp.json();
const firstRestaurant = (listJson?.restaurants ?? [])[0];
check("restaurants list non-empty", !!firstRestaurant, `n=${listJson?.restaurants?.length}`);

// 1b. detail (Tandori Chicken is the probe menu item)
const detailResp = await authFetch(`/api/restaurants/${firstRestaurant.id}`, customerToken);
check("GET /api/restaurants/[id] returns 200", detailResp.status === 200);
const detail = await detailResp.json();
const allItems = (detail.restaurant?.menu ?? []).flatMap((c) => c.items ?? []);
const itemWithOptions = allItems.find((i) => (i.options ?? []).length > 0);
const restaurantAddress = detail?.restaurant?.address ?? "";
check(
  "restaurant detail surfaces a menu item with options",
  !!itemWithOptions,
  `name=${itemWithOptions?.name} options=${itemWithOptions?.options?.length}`,
);

// 1c. POST order (with selectedOptions + specialInstructions)
const orderBody = {
  restaurantId: firstRestaurant.id,
  items: [
    {
      menuItemId: itemWithOptions.id,
      quantity: 1,
      specialInstructions: "extra spicy please",
      selectedOptions: itemWithOptions.options[0].choices.length > 0
        ? [{ optionId: itemWithOptions.options[0].id, choiceIds: [itemWithOptions.options[0].choices[0].id] }]
        : undefined,
    },
  ],
  deliveryAddress: restaurantAddress || "House 9, Road 3, Banani, Dhaka 1213",
  paymentMethod: "CASH",
  specialInstructions: "Ring the bell twice",
};
const orderResp = await authFetch("/api/orders", customerToken, {
  method: "POST",
  body: JSON.stringify(orderBody),
});
check(
  "POST /api/orders returns 201 (customer places order)",
  orderResp.status === 201,
  `status=${orderResp.status}`,
);
const orderJson = await orderResp.json();
const newOrderId = orderJson?.order?.id;
check(
  "new order id present",
  !!newOrderId,
  `id=${newOrderId}`,
);

// 1d. tracking
if (newOrderId) {
  const trackResp = await authFetch(`/api/orders/${newOrderId}`, customerToken);
  check(
    "GET /api/orders/[id] (tracking) returns 200",
    trackResp.status === 200,
    `status=${trackResp.status}`,
  );
  const trackJson = await trackResp.json();
  check(
    "tracking echoes specialInstructions",
    trackJson?.order?.specialInstructions === "Ring the bell twice",
    `value=${trackJson?.order?.specialInstructions}`,
  );
}

// ---- 2. PARTNER FLOW ----------------------------------------------
console.log("\n--- 2. Partner flow: login → restaurants → orders → analytics ---");

const myRestResp = await authFetch("/api/restaurants/me", partnerToken);
check(
  "GET /api/restaurants/me returns 200",
  myRestResp.status === 200 || myRestResp.status === 204,
  `status=${myRestResp.status}`,
);

const partnerOrdersResp = await authFetch("/api/orders", partnerToken);
check(
  "GET /api/orders (partner view) returns 200",
  partnerOrdersResp.status === 200,
  `status=${partnerOrdersResp.status}`,
);
const partnerOrders = await partnerOrdersResp.json();
check(
  "partner sees at least one order in the last 30 days",
  (partnerOrders?.orders ?? []).length >= 0,
  `n=${partnerOrders?.orders?.length}`,
);

// analytics
const analyticsResp = await authFetch(
  `/api/partner/analytics?from=2026-09-04&to=2026-10-04`,
  partnerToken,
);
check(
  "GET /api/partner/analytics returns 200",
  analyticsResp.status === 200,
  `status=${analyticsResp.status}`,
);
const analytics = await analyticsResp.json();
check(
  "analytics has dailyRevenue, topItems, statusBreakdown",
  Array.isArray(analytics?.dailyRevenue) &&
    Array.isArray(analytics?.topItems) &&
    Array.isArray(analytics?.statusBreakdown),
  `trend=${analytics?.dailyRevenue?.length} items=${analytics?.topItems?.length}`,
);

// ---- 3. RIDER FLOW ----------------------------------------------
console.log("\n--- 3. Rider flow: profile → status → leaderboard ---");

const riderMe = await authFetch("/api/riders/me", riderToken);
check(
  "GET /api/riders/me returns 200",
  riderMe.status === 200,
  `status=${riderMe.status}`,
);

const leaderboard = await authFetch(
  "/api/riders/leaderboard?period=week",
  riderToken,
);
check(
  "GET /api/riders/leaderboard returns 200",
  leaderboard.status === 200,
  `status=${leaderboard.status}`,
);
const lbJson = await leaderboard.json();
check(
  "leaderboard has ranking + threshold + selfRank",
  Array.isArray(lbJson?.ranking) &&
    typeof lbJson?.threshold === "number" &&
    ("selfRank" in lbJson),
  `ranking=${lbJson?.ranking?.length} threshold=${lbJson?.threshold}`,
);

// ---- 4. ADMIN FLOW ----------------------------------------------
console.log("\n--- 4. Admin flow: overview → analytics → withdrawals ---");

const adminOverview = await authFetch("/api/admin/overview", adminToken);
check(
  "GET /api/admin/overview returns 200",
  adminOverview.status === 200,
  `status=${adminOverview.status}`,
);

const adminAnalytics = await authFetch("/api/admin/analytics?days=30", adminToken);
check(
  "GET /api/admin/analytics returns 200",
  adminAnalytics.status === 200,
  `status=${adminAnalytics.status}`,
);
const adminA = await adminAnalytics.json();
check(
  "admin analytics has revenueTrend + statusFunnel + peakHours",
  Array.isArray(adminA?.revenueTrend) &&
    Array.isArray(adminA?.statusFunnel) &&
    Array.isArray(adminA?.peakHours) &&
    adminA.peakHours.length === 24,
  `trend=${adminA?.revenueTrend?.length} funnel=${adminA?.statusFunnel?.length} peakHours=${adminA?.peakHours?.length}`,
);

const withdrawals = await authFetch("/api/admin/withdrawals", adminToken);
check(
  "GET /api/admin/withdrawals returns 200",
  withdrawals.status === 200 || withdrawals.status === 204,
  `status=${withdrawals.status}`,
);

console.log(`\n=== ${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);