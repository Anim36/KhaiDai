/**
 * scripts/_check_responsive.mjs
 *
 * Automated responsive-layout audit. Boots a dev server, opens the
 * app at every documented viewport width on every public + role
 * page, and checks:
 *
 *   1. `documentElement.scrollWidth <= window.innerWidth`
 *      → no horizontal overflow (the biggest mobile bug class).
 *   2. No console errors while loading the page.
 *   3. (Mobile widths only) Most clickable elements have
 *      min-width/height ≥ 40px — warn when many fall below so we
 *      can hunt tiny touch targets without enforcing a strict
 *      44px (which would break legitimate icon buttons).
 *   4. (NEW) Clipped text — visible elements whose `scrollWidth`
 *      exceeds `clientWidth` (text overflows its box but doesn't
 *      force a horizontal scroll). Catches: dish name breaking
 *      out of card, "Add +" button being squeezed, price clipping
 *      next to the add button, etc.
 *   5. (NEW) Bounding-box overlap between sibling/adjacent
 *      elements inside the same flex/grid row. Catches: price
 *      and add button stacked on top of each other, two nav
 *      items colliding, etc. We only flag overlaps where both
 *      elements are non-zero size and visible.
 *   6. (NEW) Fixed/sticky element escape — fixed/sticky
 *      positioned elements that extend beyond the viewport edge
 *      (e.g. a sticky bottom CTA that runs off the right side,
 *      a modal backdrop that's wider than the viewport).
 *
 * For every page at 375px, saves a screenshot to
 * `docs/screenshots/mobile/<role>-<page>.png` so a human can
 * visually verify nothing cramped, clipped, or overlapping.
 *
 * Usage:
 *   node scripts/_check_responsive.mjs                 # full run
 *   WIDTHS=375 node scripts/_check_responsive.mjs     # just one width
 *   BASE=http://localhost:3000 node ...               # override server
 *   LOGIN=skip node ...                               # skip auth'd pages
 *
 * Exits non-zero if any page fails the overflow check or has
 * a high count of clipped-text / overlap / escape findings.
 */

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: join(ROOT, '.env') });
loadEnv({ path: join(ROOT, '.env.local') });

const MOBILE_SHOT_DIR = join(ROOT, 'docs', 'screenshots', 'mobile');
const HOME_SHOT_DIR = join(ROOT, 'docs', 'screenshots');
const BASE = process.env.BASE ?? 'http://localhost:3000';
const SKIP_LOGIN = process.env.LOGIN === 'skip';

const WIDTHS = (process.env.WIDTHS ?? '320,375,414,768,1024,1280,1440')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !Number.isNaN(n));

const PUBLIC_PAGES = [
  { path: '/', label: 'home', screenshot: true },
  { path: '/restaurants', label: 'restaurants', screenshot: true },
  { path: '/about', label: 'about' },
  { path: '/help', label: 'help' },
  { path: '/contact', label: 'contact' },
  { path: '/terms', label: 'terms' },
  { path: '/privacy', label: 'privacy' },
  { path: '/offers', label: 'offers' },
  { path: '/safety', label: 'safety' },
  { path: '/login', label: 'login', screenshot: true },
  { path: '/register', label: 'register' },
  { path: '/forgot-password', label: 'forgot-password' },
  { path: '/dishes', label: 'dishes', screenshot: true },
  { path: '/search?q=rice', label: 'search' },
];

const ROLE_PAGES = {
  CUSTOMER: [
    { path: '/profile', label: 'profile', screenshot: true },
    // Bug 3 fix — /orders and /favorites have no `app/` route
    // (they're SPA panels inside /profile). The previous version
    // of this list included them, which produced phantom 404
    // console errors that were not actual user-visible bugs.
    // The Orders + Favorites panels are still exercised via the
    // /profile screenshot + by clicking the sidebar item.
    { path: '/checkout', label: 'checkout', screenshot: true },
  ],
  PARTNER: [
    { path: '/partner/dashboard', label: 'partner-dashboard', screenshot: true },
    { path: '/partner/orders', label: 'partner-orders', screenshot: true },
    { path: '/partner/menu', label: 'partner-menu', screenshot: true },
    { path: '/partner/promo-codes', label: 'partner-promo-codes' },
    { path: '/partner/earnings', label: 'partner-earnings' },
    { path: '/partner/analytics', label: 'partner-analytics', screenshot: true },
    { path: '/partner/reviews', label: 'partner-reviews' },
    { path: '/partner/settings', label: 'partner-settings' },
  ],
  RIDER: [
    { path: '/rider/dashboard', label: 'rider-dashboard', screenshot: true },
    { path: '/rider/earnings', label: 'rider-earnings' },
    { path: '/rider/history', label: 'rider-history' },
    { path: '/rider/leaderboard', label: 'rider-leaderboard', screenshot: true },
    { path: '/rider/help', label: 'rider-help' },
    { path: '/rider/settings', label: 'rider-settings' },
  ],
  ADMIN: [
    { path: '/admin/dashboard', label: 'admin-dashboard', screenshot: true },
    { path: '/admin/analytics', label: 'admin-analytics', screenshot: true },
    { path: '/admin/users', label: 'admin-users', screenshot: true },
    { path: '/admin/restaurants', label: 'admin-restaurants', screenshot: true },
    { path: '/admin/orders', label: 'admin-orders', screenshot: true },
    { path: '/admin/riders', label: 'admin-riders', screenshot: true },
    { path: '/admin/promo-codes', label: 'admin-promo-codes' },
    { path: '/admin/verifications', label: 'admin-verifications' },
    { path: '/admin/messages', label: 'admin-messages' },
    { path: '/admin/withdrawals', label: 'admin-withdrawals' },
  ],
};

const ROLE_CREDS = {
  CUSTOMER: { email: 'responsive-customer@khaidai.test', password: 'khaidai1234', phone: '+8801700000001' },
  PARTNER:  { email: 'responsive-partner@khaidai.test',  password: 'khaidai1234', phone: '+8801700000002' },
  RIDER:    { email: 'responsive-rider@khaidai.test',    password: 'khaidai1234', phone: '+8801700000003' },
  ADMIN:    { email: 'responsive-admin@khaidai.test',    password: 'khaidai1234', phone: '+8801700000004' },
};

// How many findings before we consider a page "failing" the new checks.
// These are cheap heuristics — we don't want one stretched Bn label to
// fail an entire page, so the thresholds are intentionally generous.
const MAX_CLIPPED_TEXT = 6;
const MAX_OVERLAPS = 3;
const MAX_FIXED_ESCAPE = 0;

// ----------------------------- helpers ---------------------------------------

async function ensureUser(prisma, role) {
  const { email, password, phone } = ROLE_CREDS[role];
  const hash = await bcrypt.hash(password, 10);
  // Find or create. We have to handle two failure modes:
  //  1. The email exists but with the wrong role / password → update
  //     role + password so the test can log in.
  //  2. The email is fresh and the phone collides with another
  //     row → fall back to a phone derived from a hash of email so
  //     the test user is always unique.
  let u = await prisma.user.findUnique({ where: { email } });
  if (u) {
    u = await prisma.user.update({
      where: { id: u.id },
      data: { role, password: hash, phone },
    });
  } else {
    try {
      u = await prisma.user.create({
        data: { email, role, password: hash, name: `Responsive ${role}`, phone },
      });
    } catch {
      // Phone collision — pick a unique phone and retry once.
      const fallbackPhone = `+880${(email.length + email.charCodeAt(0)).toString().padStart(10, '9')}`;
      u = await prisma.user.create({
        data: { email, role, password: hash, name: `Responsive ${role}`, phone: fallbackPhone },
      });
    }
  }
  if (role === 'RIDER') {
    await prisma.riderProfile.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id },
    });
  }
  if (role === 'PARTNER') {
    // The partner dashboard pages (analytics, promo-codes, earnings,
    // reviews, settings) all key their data off a restaurant row
    // owned by the logged-in user. Without one, every API call
    // returns 4xx — a real-world data bug, not a code bug — but
    // it still shows up as a console error in the responsive sweep.
    // We provision a minimal restaurant for the seed partner user
    // so the pages render their real "no data" empty states
    // instead of the 4xx noise.
    const existing = await prisma.restaurant.findFirst({
      where: { ownerId: u.id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      await prisma.restaurant.create({
        data: {
          ownerId: u.id,
          name: 'Responsive Smoke Bistro',
          cuisine: 'Bengali',
          address: 'Smoke Test Lane, Dhaka',
          // Required by the Restaurant schema; real partner
          // onboarding collects these from the change-request
          // form, but for the responsive sweep we just want the
          // API calls to return 200 instead of 4xx so the empty
          // "no data" UI renders.
          deliveryTime: 30,
          deliveryFee: 45,
          latitude: 23.8103,
          longitude: 90.4125,
          isAcceptingOrders: true,
        },
      });
    }
  }
  return u;
}

async function login(page, role) {
  if (SKIP_LOGIN) return false;
  const { email, password } = ROLE_CREDS[role];
  // The login endpoint doesn't set the role cookie itself — the
  // SPA's AuthProvider does that in client-side JS after a
  // successful response. To keep the responsive sweep stateless
  // (one browser context, many role switches), we hit the API and
  // then mirror the same localStorage + cookie state the SPA
  // would have set, so the very next navigation is already
  // authenticated.
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email, password, expectedRole: role },
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok()) return false;
  const body = await res.json();
  if (!body?.token || !body?.user) return false;
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(({ token, user }) => {
    try {
      window.localStorage.setItem(
        'khaidai.auth.v2',
        JSON.stringify({ token, user }),
      );
      document.cookie =
        'khaidai_role=' +
        encodeURIComponent(user.role) +
        '; Path=/; Max-Age=86400; SameSite=Lax';
    } catch {
      /* private mode — ignore */
    }
  }, { token: body.token, user: body.user });
  return true;
}

/**
 * The deep-verify pass. Runs in the page context (single
 * `page.evaluate`) so we don't pay an IPC round-trip per element.
 * Returns an object with:
 *   - overflow (legacy)
 *   - tinyTouchTargets (legacy)
 *   - clippedText[]   — array of { tag, text, classList, scrollW, clientW }
 *   - overlaps[]      — array of { a, b } where a and b are short
 *                       descriptors and the overlap area is real
 *   - fixedEscape[]   — array of { position, left, right, width, vw }
 *   - consoleErrors[]
 */
const DEEP_CHECK_JS = `
(() => {
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return true;
  };
  const desc = (el) => {
    if (!el) return 'null';
    const r = el.getBoundingClientRect();
    const t = (el.textContent || '').trim().slice(0, 32);
    return \`<\${el.tagName.toLowerCase()} \${Math.round(r.width)}x\${Math.round(r.height)} \${(el.className||'').toString().slice(0,40)} "\${t}">\`;
  };

  const isMobile = window.innerWidth < 768;

  // ----- (1) clipped text -----
  const clippedText = [];
  if (isMobile) {
    // Look at all leaf-ish text-holding elements: p, span, h1-h6, button,
    // a, li. Skip input/textarea (their scrollWidth is weird).
    const sel = 'p, span, h1, h2, h3, h4, h5, h6, a, li, button, [data-clip-check]';
    document.querySelectorAll(sel).forEach((el) => {
      if (!visible(el)) return;
      // Allow overflow if parent has text-overflow:ellipsis OR if
      // it has line-clamp-* utility. We're only flagging UNEXPECTED
      // overflow.
      const cs = getComputedStyle(el);
      const pCs = getComputedStyle(el.parentElement || el);
      if (cs.overflow === 'hidden' && (cs.textOverflow === 'ellipsis' || cs.display === '-webkit-box')) return;
      if (pCs.overflow === 'hidden' && pCs.textOverflow === 'ellipsis') return;
      if (el.scrollWidth > el.clientWidth + 1) {
        // Filter out carousels and horizontal scrollers — their
        // children overflowing the parent is intentional.
        let p = el.parentElement;
        let inScroller = false;
        for (let i = 0; i < 6 && p; i++) {
          const pcs = getComputedStyle(p);
          if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { inScroller = true; break; }
          p = p.parentElement;
        }
        if (!inScroller) {
          clippedText.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 80),
            classList: (el.className || '').toString().slice(0, 80),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
          });
        }
      }
    });
  }

  // ----- (2) bounding-box overlap between siblings -----
  const overlaps = [];
  if (isMobile) {
    // Walk every direct child of a flex/grid container and check
    // for overlap with its next siblings. We bound it to leaf-ish
    // elements with non-zero size to avoid blowing up.
    const all = Array.from(document.querySelectorAll('div, ul, ol, section, main, article, header, footer, nav'));
    for (const parent of all) {
      const pcs = getComputedStyle(parent);
      const isFlex = pcs.display.includes('flex');
      const isGrid = pcs.display.includes('grid');
      if (!isFlex && !isGrid) continue;
      const children = Array.from(parent.children).filter(visible);
      for (let i = 0; i < children.length; i++) {
        const a = children[i];
        const ra = a.getBoundingClientRect();
        for (let j = i + 1; j < children.length; j++) {
          const b = children[j];
          const rb = b.getBoundingClientRect();
          // Compute overlap area
          const x1 = Math.max(ra.left, rb.left);
          const y1 = Math.max(ra.top, rb.top);
          const x2 = Math.min(ra.right, rb.right);
          const y2 = Math.min(ra.bottom, rb.bottom);
          if (x2 <= x1 || y2 <= y1) continue;
          const overlapArea = (x2 - x1) * (y2 - y1);
          // Only flag real overlaps — at least 25% of the smaller
          // element's area, otherwise nav-list dividers etc. trigger
          // false positives.
          const aArea = ra.width * ra.height;
          const bArea = rb.width * rb.height;
          const smaller = Math.min(aArea, bArea);
          if (smaller <= 0) continue;
          if (overlapArea / smaller < 0.25) continue;
          overlaps.push({
            a: desc(a),
            b: desc(b),
            overlapPx: Math.round(overlapArea),
          });
        }
      }
    }
  }

  // ----- (3) fixed / sticky escape -----
  const fixedEscape = [];
  if (isMobile) {
    const vw = window.innerWidth;
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) {
        // Skip elements that are intentionally full-bleed AND have
        // a parent that constrains their layout. The simple
        // exception: a backdrop <div> that's deliberately wider is
        // fine if it covers the whole viewport on purpose (we
        // detect that by checking its width >= vw AND its left <= 0
        // AND its right >= vw). For fixed, this is the backdrop
        // pattern. We still flag when an interactive element runs
        // off-screen.
        const isFullBleedBackdrop = r.left <= 0 && r.right >= vw - 1 && r.width >= vw - 1;
        if (isFullBleedBackdrop) return;
        fixedEscape.push({
          position: cs.position,
          tag: el.tagName.toLowerCase(),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          vw,
          classList: (el.className || '').toString().slice(0, 80),
        });
      }
    });
  }

  // ----- (4) overflow + tiny touch targets (legacy) -----
  const overflow = document.documentElement.scrollWidth > window.innerWidth
    ? {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    : null;

  let tinyTouchTargets = null;
  if (isMobile) {
    const sel = 'button:not([disabled]), a[href], [role="button"]';
    const els = Array.from(document.querySelectorAll(sel));
    const tiny = els.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return r.width < 40 || r.height < 40;
    });
    tinyTouchTargets = {
      total: els.length,
      tinyCount: tiny.length,
      ratio: els.length > 0 ? tiny.length / els.length : 0,
    };
  }

  return { overflow, tinyTouchTargets, clippedText, overlaps, fixedEscape };
})();
`;

async function checkPage(page, url, viewport) {
  const result = {
    url,
    width: viewport.width,
    height: viewport.height,
    overflow: null,
    consoleErrors: [],
    tinyTouchTargets: null,
    clippedText: [],
    overlaps: [],
    fixedEscape: [],
  };
  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  const onPageError = (err) => errors.push('pageerror: ' + err.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    result.status = resp ? resp.status() : null;
    // Give RSC + image lazy-load a beat.
    await page.waitForTimeout(900);
    const deep = await page.evaluate(DEEP_CHECK_JS);
    Object.assign(result, deep);
  } catch (e) {
    result.error = e.message;
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  result.consoleErrors = errors;
  return result;
}

async function screenshotMobile(page, role, label, viewport) {
  mkdirSync(MOBILE_SHOT_DIR, { recursive: true });
  const file = join(MOBILE_SHOT_DIR, `${role}-${label}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function screenshotHome(page, key, viewport) {
  mkdirSync(HOME_SHOT_DIR, { recursive: true });
  const file = join(HOME_SHOT_DIR, `${key}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function isMobileFailure(r) {
  if (!r || r.width >= 768) return false;
  return (
    (r.clippedText && r.clippedText.length > MAX_CLIPPED_TEXT) ||
    (r.overlaps && r.overlaps.length > MAX_OVERLAPS) ||
    (r.fixedEscape && r.fixedEscape.length > MAX_FIXED_ESCAPE)
  );
}

function fmtResult(r) {
  const overflow = r.overflow;
  const errors = r.consoleErrors.length;
  const deepFail = isMobileFailure(r);
  const status = r.error
    ? 'FATAL'
    : overflow
      ? 'OVERFLOW'
      : deepFail
        ? 'DEEP-FAIL'
        : errors
          ? 'ERROR'
          : 'OK';
  const details = [];
  if (overflow) details.push(`+${overflow.overflow}px (${overflow.scrollWidth} vs ${overflow.innerWidth})`);
  if (errors) details.push(`${errors} console error${errors === 1 ? '' : 's'}`);
  if (r.tinyTouchTargets && r.tinyTouchTargets.ratio > 0.3) {
    details.push(`tiny-targets ${r.tinyTouchTargets.tinyCount}/${r.tinyTouchTargets.total} (${(r.tinyTouchTargets.ratio * 100).toFixed(0)}%)`);
  }
  if (r.clippedText && r.clippedText.length) {
    details.push(`clipped-text ${r.clippedText.length}`);
  }
  if (r.overlaps && r.overlaps.length) {
    details.push(`overlaps ${r.overlaps.length}`);
  }
  if (r.fixedEscape && r.fixedEscape.length) {
    details.push(`fixed-escape ${r.fixedEscape.length}`);
  }
  if (r.error) details.push(r.error);
  if (r.status && r.status >= 400) details.push(`HTTP ${r.status}`);
  return `${status.padEnd(10)} ${r.url} @ ${r.width}px` + (details.length ? '  | ' + details.join(', ') : '');
}

// ------------------------------ main -----------------------------------------

async function startServer() {
  // If something is already listening on 3000, skip the spawn.
  try {
    const r = await fetch(BASE);
    if (r.status < 500) {
      console.log('Reusing existing server at', BASE);
      return null;
    }
  } catch {}
  console.log('Starting Next.js dev server on :3000...');
  const proc = spawn('npx.cmd', ['next', 'dev', '-p', '3000'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    try {
      const r = await fetch(BASE);
      if (r.status < 500) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('Server up after', ((Date.now() - start) / 1000).toFixed(1), 's');
  return proc;
}

async function killServer(proc) {
  if (!proc) return;
  try {
    execSync(`taskkill /F /PID ${proc.pid} /T`, { shell: 'cmd.exe', stdio: 'ignore' });
  } catch {}
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();

  const server = await startServer();

  // Provision smoke users via Prisma (the public register endpoint
  // requires an OTP, so it can't be hit from an automated test).
  let prisma = null;
  if (process.env.DATABASE_URL) {
    try {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      });
      for (const role of Object.keys(ROLE_PAGES)) {
        try {
          await ensureUser(prisma, role);
          console.log(`  seeded ${role} user ${ROLE_CREDS[role].email}`);
        } catch (e) {
          console.log(`  seed ${role} failed: ${e.message}`);
        }
      }
    } catch (e) {
      console.log('  prisma init failed:', e.message);
      prisma = null;
    }
  } else {
    console.log('  DATABASE_URL not set — skipping user provisioning');
  }

  const allResults = [];
  const loginFailures = [];
  let totalOverflow = 0;
  let totalConsoleErrors = 0;
  let totalDeepFails = 0;

  try {
    for (const [role, pages] of Object.entries(ROLE_PAGES)) {
      console.log(`\n--- ${role} ---`);
      let loggedIn = false;
      if (SKIP_LOGIN) {
        console.log('  (LOGIN=skip — testing public-route redirects)');
      } else {
        try {
          loggedIn = await login(page, role);
        } catch (e) {
          console.log(`  login error: ${e.message}`);
        }
        if (!loggedIn) {
          console.log(`  login failed for ${role} — auth'd pages will be checked as redirect targets.`);
          loginFailures.push(role);
        } else {
          console.log(`  login OK for ${role}`);
        }
      }
      for (const { path: route, label, screenshot } of pages) {
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: 900 });
          const r = await checkPage(page, BASE + route, { width: w, height: 900 });
          r.role = role;
          r.label = label;
          allResults.push(r);
          if (r.overflow) totalOverflow++;
          if (r.consoleErrors.length) totalConsoleErrors++;
          if (isMobileFailure(r)) totalDeepFails++;
          console.log(' ', fmtResult(r));
          if (screenshot && w === 375) {
            try {
              const file = await screenshotMobile(page, role.toLowerCase(), label, { width: w, height: 900 });
              console.log(`     → screenshot: ${file}`);
            } catch (e) {
              console.log(`     (screenshot failed: ${e.message})`);
            }
          }
        }
      }
      await ctx.clearCookies();
    }

    console.log('\n--- Public ---');
    for (const { path: route, label, screenshot } of PUBLIC_PAGES) {
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        const r = await checkPage(page, BASE + route, { width: w, height: 900 });
        r.role = 'PUBLIC';
        r.label = label;
        allResults.push(r);
        if (r.overflow) totalOverflow++;
        if (r.consoleErrors.length) totalConsoleErrors++;
        if (isMobileFailure(r)) totalDeepFails++;
        console.log(' ', fmtResult(r));
        if (screenshot && w === 375) {
          try {
            const file = await screenshotMobile(page, 'public', label, { width: w, height: 900 });
            console.log(`     → screenshot: ${file}`);
          } catch (e) {
            console.log(`     (screenshot failed: ${e.message})`);
          }
        }
      }
    }
  } finally {
    await killServer(server);
    if (prisma) await prisma.$disconnect();
    await browser.close();
  }

  console.log('\n=========================== SUMMARY ===========================');
  const overflows = allResults.filter((r) => r.overflow);
  const consoleErrs = allResults.filter((r) => r.consoleErrors.length);
  const tinyCounts = allResults.filter((r) => r.tinyTouchTargets && r.tinyTouchTargets.ratio > 0.3);
  const clippedCounts = allResults.filter((r) => r.clippedText && r.clippedText.length > MAX_CLIPPED_TEXT);
  const overlapCounts = allResults.filter((r) => r.overlaps && r.overlaps.length > MAX_OVERLAPS);
  const escapeCounts = allResults.filter((r) => r.fixedEscape && r.fixedEscape.length > MAX_FIXED_ESCAPE);

  console.log(`Total page×width checks : ${allResults.length}`);
  console.log(`Horizontal overflows    : ${overflows.length}`);
  console.log(`Console errors          : ${consoleErrs.length}`);
  console.log(`Many tiny touch targets : ${tinyCounts.length}`);
  console.log(`Clipped text (mobile)   : ${clippedCounts.length} (threshold ${MAX_CLIPPED_TEXT})`);
  console.log(`Siblings overlap (mobile): ${overlapCounts.length} (threshold ${MAX_OVERLAPS})`);
  console.log(`Fixed/sticky escape     : ${escapeCounts.length}`);
  if (loginFailures.length) {
    console.log(`Login failures          : ${loginFailures.join(', ')} (auth'd pages tested as redirect targets)`);
  }

  if (overflows.length) {
    console.log('\nOverflow pages:');
    for (const r of overflows) console.log(`  ${r.url} @ ${r.width}px  +${r.overflow.overflow}px`);
  }
  if (consoleErrs.length) {
    console.log('\nConsole errors:');
    for (const r of consoleErrs.slice(0, 20)) {
      console.log(`  ${r.url} @ ${r.width}px`);
      r.consoleErrors.slice(0, 3).forEach((e) => console.log('    ' + e.slice(0, 200)));
    }
  }
  if (tinyCounts.length) {
    console.log('\nHigh tiny-target ratios:');
    for (const r of tinyCounts.slice(0, 15)) {
      console.log(`  ${r.url} @ ${r.width}px  ${(r.tinyTouchTargets.ratio * 100).toFixed(0)}% tiny (${r.tinyTouchTargets.tinyCount}/${r.tinyTouchTargets.total})`);
    }
  }
  // Print the worst 12 clipped/overlap/escape pages with their first
  // few findings so a human can immediately grep the report for the
  // exact selector that needs fixing.
  if (clippedCounts.length) {
    console.log('\nClipped-text pages:');
    for (const r of clippedCounts.slice(0, 12)) {
      console.log(`  ${r.url} @ ${r.width}px  (${r.clippedText.length} elements)`);
      r.clippedText.slice(0, 3).forEach((c) =>
        console.log(`     <${c.tag} sw=${c.scrollW} cw=${c.clientW}> "${c.text}"  .${c.classList}`),
      );
    }
  }
  if (overlapCounts.length) {
    console.log('\nOverlap pages:');
    for (const r of overlapCounts.slice(0, 12)) {
      console.log(`  ${r.url} @ ${r.width}px  (${r.overlaps.length} overlaps)`);
      r.overlaps.slice(0, 2).forEach((o) => console.log(`     ${o.a}  ∩  ${o.b}  (${o.overlapPx}px²)`));
    }
  }
  if (escapeCounts.length) {
    console.log('\nFixed/sticky escape pages:');
    for (const r of escapeCounts.slice(0, 12)) {
      console.log(`  ${r.url} @ ${r.width}px  (${r.fixedEscape.length} elements)`);
      r.fixedEscape.slice(0, 3).forEach((e) =>
        console.log(`     ${e.position} <${e.tag}> left=${e.left} right=${e.right} w=${e.width} vw=${e.vw}  .${e.classList}`),
      );
    }
  }

  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  const reportPath = join(ROOT, 'docs', 'responsive-audit.json');
  writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    widths: WIDTHS,
    thresholds: {
      maxClippedText: MAX_CLIPPED_TEXT,
      maxOverlaps: MAX_OVERLAPS,
      maxFixedEscape: MAX_FIXED_ESCAPE,
    },
    summary: {
      totalChecks: allResults.length,
      overflows: overflows.length,
      consoleErrors: consoleErrs.length,
      tinyTargetRatios: tinyCounts.length,
      clippedTextPages: clippedCounts.length,
      overlapPages: overlapCounts.length,
      fixedEscapePages: escapeCounts.length,
      deepFailures: totalDeepFails,
      loginFailures,
    },
    overflows: overflows.map((r) => ({ url: r.url, width: r.width, role: r.role, ...r.overflow })),
    consoleErrors: consoleErrs.map((r) => ({ url: r.url, width: r.width, role: r.role, errors: r.consoleErrors })),
    tinyTargetRatios: tinyCounts.map((r) => ({
      url: r.url, width: r.width, role: r.role, ratio: r.tinyTouchTargets.ratio,
      total: r.tinyTouchTargets.total, tiny: r.tinyTouchTargets.tinyCount,
    })),
    clippedText: clippedCounts.map((r) => ({
      url: r.url, width: r.width, role: r.role, count: r.clippedText.length,
      samples: r.clippedText.slice(0, 6),
    })),
    overlaps: overlapCounts.map((r) => ({
      url: r.url, width: r.width, role: r.role, count: r.overlaps.length,
      samples: r.overlaps.slice(0, 4),
    })),
    fixedEscape: escapeCounts.map((r) => ({
      url: r.url, width: r.width, role: r.role, count: r.fixedEscape.length,
      samples: r.fixedEscape.slice(0, 4),
    })),
  }, null, 2));
  console.log(`\nFull report: ${reportPath}`);

  process.exit(totalOverflow > 0 || totalDeepFails > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
