// Comprehensive E2E verification: BN i18n on dishes / restaurants /
// checkout + the price "—" hardening + the rider notification
// apiFetch fix. Walks the actual customer flow on a fresh page.
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');

const BASE = 'http://localhost:3007';

function peekRiderDb() {
  const r = spawnSync('node', ['scripts/check-rider-notifs.mjs'], {
    cwd: 'D:\\KhaiDai\\khaidai',
    encoding: 'utf8',
  });
  return r.stdout + (r.stderr || '');
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  return !page.url().includes('/login');
}

async function setupLocale(page, locale) {
  await page.evaluate((l) => localStorage.setItem('khaidai.locale', l), locale);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);
}

async function inspectCheckoutRows(page) {
  return await page.evaluate(() => {
    const out = {};
    for (const k of ['items-subtotal', 'delivery-fee', 'vat-tax', 'total']) {
      const el = document.querySelector(`[data-row="${k}"]`);
      out[k] = el ? el.textContent.trim() : null;
    }
    return out;
  });
}

async function findHardcoded(page, patterns) {
  return await page.evaluate((ps) => {
    const text = document.body.textContent;
    const found = [];
    for (const p of ps) {
      const re = new RegExp(p, 'gi');
      const matches = text.match(re);
      if (matches) found.push({ pattern: p, count: matches.length, samples: [...new Set(matches)].slice(0, 3) });
    }
    return found;
  }, patterns);
}

async function expectNoHardcoded(page, patterns, label) {
  const found = await findHardcoded(page, patterns);
  if (found.length === 0) {
    console.log(`  ${label}: ✓ no hardcoded strings`);
  } else {
    console.log(`  ${label}: ✗ hardcoded strings found:`, JSON.stringify(found, null, 2));
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

  // ----- BUG 1: BN i18n for dishes / restaurants / checkout -----
  console.log('\n=== BUG 1: BN i18n ===');
  const ok = await login(page, 'customer-smoke@khaidai.test', 'Password1!');
  if (!ok) {
    console.log('Customer login failed, aborting');
    await browser.close();
    return;
  }
  console.log('  Customer logged in');

  // /dishes
  await page.goto(`${BASE}/dishes`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await setupLocale(page, 'bn');
  await expectNoHardcoded(page, ['All Trending Dishes', 'Under ৳200', 'No dishes match'], 'dishes/BN');

  // /restaurants
  await page.goto(`${BASE}/restaurants`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await setupLocale(page, 'bn');
  await expectNoHardcoded(page, ['All Restaurants', 'Filters', 'Sort by', 'Cuisine', 'Delivery time'], 'restaurants/BN');

  // /checkout (with item in cart)
  await page.goto(`${BASE}/dishes`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  const addBtn = page.locator('button[aria-label*="Add"], button:has-text("যোগ করুন")').first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    console.log('  Added item to cart');
  }
  await page.goto(`${BASE}/checkout`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await setupLocale(page, 'bn');
  await expectNoHardcoded(page, [
    'Review Cart Items', 'Delivery Address', 'Choose Payment Method',
    'Order Summary', 'Items Subtotal', 'Delivery Fee', 'Platform Vat/Tax', 'Total to Pay',
  ], 'checkout/BN');

  // ----- BUG 2: prices render correctly in both locales -----
  console.log('\n=== BUG 2: Checkout price rows ===');
  const cartCount = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('khaidai.cart.v1') || 'null')?.lines?.length ?? 0; } catch { return 0; }
  });
  console.log(`  Cart lines: ${cartCount}`);
  console.log('  Prices (BN):', await inspectCheckoutRows(page));
  await setupLocale(page, 'en');
  console.log('  Prices (EN):', await inspectCheckoutRows(page));

  // ----- BUG 3: rider notification toggle -----
  console.log('\n=== BUG 3: Rider notification toggle ===');
  // Logout
  await page.evaluate(() => localStorage.removeItem('khaidai.auth.v2'));
  // Login as rider via /rider/login so we get the right role
  await page.goto(`${BASE}/rider/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', '22201036@uap-bd.edu');
  await page.fill('input[type="password"]', 'Password1!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('  Rider URL after login:', page.url());
  await page.goto(`${BASE}/rider/settings`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  const toggles = await page.locator('[role="switch"]').all();
  console.log('  Toggles found:', toggles.length);
  if (toggles.length > 0) {
    const before = await page.evaluate(() => {
      const els = document.querySelectorAll('[role="switch"]');
      return Array.from(els).map(e => e.getAttribute('aria-checked') || e.getAttribute('data-state') || 'unknown');
    });
    await toggles[0].click();
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => {
      const els = document.querySelectorAll('[role="switch"]');
      return Array.from(els).map(e => e.getAttribute('aria-checked') || e.getAttribute('data-state') || 'unknown');
    });
    console.log('  Toggle states before:', before);
    console.log('  Toggle states after:', after);
    console.log('  DB state:');
    console.log(peekRiderDb());
  }

  await browser.close();
  console.log('\nDone.');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });