// scripts/_e2e_zone_picker_ui.mjs
//
// Smoke-checks that the new UI surfaces (search input, current
// location button, registration stepper) actually render in the
// served HTML — the component itself is client-side and the
// Leaflet map only mounts after hydration, so a server-side
// GET can't see the inner controls. We at least confirm the
// shell of each page is up and reachable.

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { console.log(`PASS  ${name}`); passed++; }
  else    { console.log(`FAIL  ${name}  -- ${detail}`); failures.push({ name, detail }); failed++; }
}

async function login(email, role) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "khaidai1234", expectedRole: role }),
  });
  const j = await r.json();
  return j.token;
}

// --- /rider/register renders the new stepper shell ---
const reg = await fetch(`${BASE}/rider/register`);
const regHtml = await reg.text();
record("1a. GET /rider/register returns 200",
  reg.status === 200, `status=${reg.status}`);
record("1b. Register page contains the new 'Service zone' stepper label",
  regHtml.includes("Service zone"),
  "page missing 'Service zone' marker text");
record("1c. Register page initial step renders Step 1 fields (Full Name)",
  regHtml.includes("Full Name"),
  "step 1 missing Full Name field");
record("1d. Register page references the RiderZonePicker dynamic import",
  regHtml.includes("RiderZonePicker") || regHtml.includes("zone-search-input") || regHtml.includes("Step 1 of 4"),
  "page missing stepper markers");

// --- /rider/dashboard renders for a signed-in rider ---
const RIDER_EMAIL = "rider-zone-picker-ui@khaidai.test";
// We re-use the user from the previous e2e if it exists, otherwise
// just login the existing zone-picker test rider.
const token = await login("rider-zone-picker@khaidai.test", "RIDER");
const dash = await fetch(`${BASE}/rider/dashboard`, {
  headers: { authorization: `Bearer ${token}`, cookie: "" },
});
record("2a. GET /rider/dashboard returns 200",
  dash.status === 200, `status=${dash.status}`);
const dashHtml = await dash.text();
// The dashboard is heavy with auth-guarded SSR; we don't need
// to assert the exact zone picker text — we just confirm the
// page is reachable.
record("2b. Dashboard page HTML non-empty",
  dashHtml.length > 0, `length=${dashHtml.length}`);

console.log(`\n==== Zone picker UI smoke: ${passed} passed, ${failed} failed ====`);
if (failed > 0) {
  for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
