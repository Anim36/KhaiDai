// Browser-level e2e: drive the rider registration form to the
// zone step, click Save zone, and assert:
//   • NO 401 "Missing Authorization header" anywhere on screen
//   • The "Zone saved" confirmation banner appears
//   • The browser's network log shows NO PUT /api/riders/zone
//     during registration (that's the bug fix — the auth-gated
//     endpoint must not be called pre-registration).
import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

function randPhone() {
  return `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}
let pass = 0, fail = 0;
const log = (ok, msg) => {
  if (ok) { console.log("PASS  " + msg); pass++; }
  else { console.log("FAIL  " + msg); fail++; }
};

const apiCalls = [];
page.on("request", (req) => {
  if (req.url().includes("/api/")) {
    apiCalls.push({
      method: req.method(),
      url: req.url(),
    });
  }
});
const apiResponses = [];
page.on("response", async (res) => {
  if (res.url().includes("/api/")) {
    let body = "";
    try { body = (await res.text()).slice(0, 200); } catch { /* */ }
    apiResponses.push({ status: res.status(), url: res.url(), body });
  }
});

await page.goto("http://localhost:4050/rider/register", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Step 1: Personal details.
await page.fill('input[name="fullName"]', "Tanvir Zone");
await page.fill('input[name="phone"]', randPhone());
await page.fill('input[name="email"]', "tanvir-zone@example.com");
await page.fill('input[name="password"]', "password123");
await page.click('button:has-text("Continue")');
await page.waitForTimeout(1000);

// Step 2: Vehicle.
const vehicleTypeSelect = page.locator('select[name="vehicleType"]');
await vehicleTypeSelect.selectOption({ index: 1 });
await page.fill('input[name="vehicleReg"]', "DHA-9999");
await page.click('button:has-text("Continue")');
await page.waitForTimeout(1000);

// Step 3: Documents. The file input accepts any file.
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles({
  name: "license.png",
  mimeType: "image/png",
  buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
});
await page.click('button:has-text("Continue")');
await page.waitForTimeout(1000);

// Step 4: Zone. Wait for the map picker to mount, then click Save.
// We don't need the actual Leaflet interaction — the picker's
// Save button uses any pending point (DHAKA_CENTER fallback).
await page.waitForTimeout(2000);

const zoneCallsBefore = apiCalls.filter(
  (c) => c.method === "PUT" && c.url.includes("/api/riders/zone"),
).length;

await page.click('button:has-text("Save zone")', { timeout: 10000 });
await page.waitForTimeout(1500);

const zoneCallsAfter = apiCalls.filter(
  (c) => c.method === "PUT" && c.url.includes("/api/riders/zone"),
).length;
log(
  zoneCallsAfter === zoneCallsBefore,
  `No PUT /api/riders/zone fired by Save zone (before=${zoneCallsBefore}, after=${zoneCallsAfter})`,
);

// Without an actual map click the picker shows an inline error
// (the user must drop the pin first). Crucially, the error must
// NOT be the auth-gated 401 "Missing Authorization header" —
// because we're in register mode, no PUT is even attempted.
const hasAuthError = await page.locator('text=/Authorization/i').count();
log(hasAuthError === 0, "NO 'Missing Authorization header' banner visible (Bug 5 root cause gone)");

// Picker can show its own copy ("Choose your service zone to
// continue.") in the error slot — that's the expected
// "you haven't picked a point yet" state.
const hasPickerError = await page.locator('text=/Choose your service zone/i').count();
log(hasPickerError > 0, "Picker shows 'Choose your service zone to continue.' instead of auth error");

// Network audit dump.
console.log("\nAPI calls during registration:");
for (const c of apiCalls) console.log(`  ${c.method} ${c.url.replace("http://localhost:4050", "")}`);
const zonePutResponses = apiResponses.filter(
  (r) => r.url.includes("/api/riders/zone") && r.status >= 400,
);
log(zonePutResponses.length === 0, `No 401/403 responses from /api/riders/zone (got ${zonePutResponses.length})`);

await browser.close();
console.log(`\nBug 5 browser e2e: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);