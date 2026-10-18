/**
 * Temporary: complete a REAL dummy card payment on the SSLCommerz
 * sandbox and assert our success callback + IPN flip the order to
 * PAID and bounce the customer to the tracking page.
 *
 * Gateway input names discovered from the live SPA:
 *   #ccnum (card number), #expiry (MM/YY), #email (CVC),
 *   input[name='name'] (card holder), #remember_check
 *
 * Delete after verification.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = "http://localhost:3000";
const PASSWORD = "Pa55word!";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function main() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "sslcz.customer@example.com",
      password: PASSWORD,
      expectedRole: "CUSTOMER",
    }),
  });
  const auth = (await res.json()) as {
    token: string;
    user: { id: string; name: string; email: string; phone: string | null };
  };

  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: "sslcz.customer@example.com" },
  });
  const restaurant = await prisma.restaurant.findFirstOrThrow({
    where: { name: "SSLCommerz Test Kitchen" },
  });
  const menuItem = await prisma.menuItem.findFirstOrThrow({
    where: { restaurantId: restaurant.id },
  });
  const address = await prisma.address.findFirstOrThrow({
    where: { userId: customer.id },
  });

  const created = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({
      restaurantId: restaurant.id,
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
      deliveryAddress: address.fullAddress,
      paymentMethod: "CARD",
    }),
  });
  const orderId = ((await created.json()) as { order: { id: string } }).order
    .id;
  const init = await fetch(`${BASE}/api/payments/sslcommerz/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({ orderId }),
  });
  const { gatewayPageURL } = (await init.json()) as {
    gatewayPageURL: string;
  };
  console.log(`order: ${orderId}`);
  console.log(`gateway: ${gatewayPageURL}\n`);

  const before = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentGatewayStatus: true, status: true },
  });
  // init has already run, so the order is PENDING/NOT_INITIATED at
  // this point — the gateway session is open but unpaid.
  check(
    "after init: gateway status is PENDING, order still PENDING",
    before.paymentGatewayStatus === "PENDING" && before.status === "PENDING",
    `gw=${before.paymentGatewayStatus} order=${before.status}`,
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  // Seed the session so the redirect back to /orders/.../track is
  // authenticated (RequireAuth would otherwise bounce to /login).
  await page.addInitScript((a) => {
    localStorage.setItem("khaidai.auth.v2", JSON.stringify(a));
  }, { token: auth.token, user: auth.user });

  await page.goto(gatewayPageURL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // SSLCommerz sandbox dummy card (documented in their sandbox docs).
  await page.fill("#ccnum", "4111111111111111");
  await page.fill("#expiry", "12/30");
  await page.fill("#email", "123");
  await page.fill("input[name='name']", "SSL TEST");
  await page.waitForTimeout(500);

  const payBtn = page.locator("button").first();
  const disabled = await payBtn.isDisabled();
  console.log(`pay button disabled after filling: ${disabled}`);
  if (disabled) {
    await page.waitForTimeout(1500);
    console.log("pay button disabled after waiting:",
      await payBtn.isDisabled());
  }

  await payBtn.click({ force: true }).catch((e) =>
    console.log("click warn:", e.message),
  );

  // The gateway may show a 3-D Secure / OTP interstitial; accept it.
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2500);
    const url = page.url();
    if (url.includes("localhost:3000") || url.includes("/orders/")) break;

    // SSLCommerz's sandbox card flow lands on an OTP page. The
    // documented sandbox OTP is any 6-digit value (we use 123456);
    // some variants auto-accept. Fill whatever OTP box is present.
    const otp = page
      .locator(
        "input[name='otp'], #otp, input[placeholder*='OTP' i], input[placeholder*='PIN' i]",
      )
      .first();
    if ((await otp.count()) > 0 && (await otp.isVisible().catch(() => false))) {
      console.log(`  (OTP screen at step ${i + 1} — entering 123456)`);
      await otp.fill("123456").catch(() => {});
      await page.waitForTimeout(400);
    }

    // Then press whichever submit control is enabled.
    const submit = page
      .locator("button:not([disabled]), input[type=submit]")
      .first();
    if ((await submit.count()) > 0) {
      const label = (await submit.textContent())?.trim().slice(0, 30);
      console.log(`  (clicking "${label}" at step ${i + 1})`);
      await submit.click({ force: true, timeout: 5000 }).catch(() => {});
    }

    if (i === 0) {
      // Dump the screen once so we can see what we're dealing with.
      const txt = (await page.textContent("body"))?.replace(/\s+/g, " ") ?? "";
      console.log("  screen text:", txt.slice(0, 400));
    }
  }

  // Wait for the redirect home.
  await page
    .waitForURL(/localhost:3000/, { timeout: 60000 })
    .catch(() => {});
  console.log("\nFINAL URL:", page.url());
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "e2e-final.png", fullPage: true });

  const after = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      paymentGatewayStatus: true,
      gatewayTransactionId: true,
      gatewaySessionKey: true,
      status: true,
    },
  });
  console.log("\nDB state:", JSON.stringify(after, null, 2));

  check(
    "paymentGatewayStatus === PAID (real validation passed)",
    after.paymentGatewayStatus === "PAID",
    `got=${after.paymentGatewayStatus}`,
  );
  check(
    "gatewayTransactionId recorded",
    !!after.gatewayTransactionId,
  );
  check(
    "gatewaySessionKey cleared after payment",
    after.gatewaySessionKey === null,
  );
  check(
    "Order.status stays PENDING after payment (Bug 1 — partner must Accept)",
    after.status === "PENDING",
    `got=${after.status}`,
  );
  check(
    "redirected back to /orders/[id]/track",
    /\/orders\/[^/]+\/track/.test(page.url()),
    `url=${page.url()}`,
  );
  check(
    "tracking URL carries the paid=1 indicator",
    page.url().includes("paid=1"),
    `url=${page.url()}`,
  );

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
  await browser.close();
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
