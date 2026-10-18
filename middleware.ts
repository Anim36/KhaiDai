import { NextResponse, type NextRequest } from "next/server";

/**
 * Role-based access control at the Edge.
 *
 * How it knows who you are:
 *   • `AuthProvider` mirrors the signed-in role into a same-origin
 *     cookie named `khaidai_role` whenever it writes the JWT to
 *     localStorage. This middleware reads that cookie.
 *   • The cookie is **not** the source of truth for auth — the JWT
 *     is. So we only use the cookie to short-circuit obvious
 *     cross-portal navigation. If the cookie is missing the request
 *     is treated as a guest and `RequireAuth` (client-side) does the
 *     full check after hydration.
 *
 * Path map:
 *
 *   • /partner/*          ← PARTNER only (or guest → RequireAuth)
 *   • /rider/*            ← RIDER only (or guest → RequireAuth)
 *   • /admin/*            ← ADMIN only (or guest → /admin/login)
 *   • everything else     ← CUSTOMER + guest; PARTNER/RIDER/ADMIN can
 *                            still browse shared public pages (/login,
 *                            /register, marketing routes).
 *                            They are only blocked from the customer
 *                            funnel routes listed below — checkout,
 *                            profile, order history — because those
 *                            would either leak the wrong session into
 *                            the wrong UI or hit an API that expects
 *                            a CUSTOMER token. (কাজ ২ added `/` to the
 *                            list of customer-only routes.)
 *
 * ADMIN is intentionally locked to /admin/* only — no peek-into
 * /partner/dashboard, /rider/dashboard, or the customer tree (even
 * read-only). This keeps the admin surface compact and mirrors the
 * other roles' lockdown.
 *
 * Login/register pages are intentionally NOT blocked here — a
 * PARTNER who wants to log in as a CUSTOMER (or vice-versa) needs
 * to land on /login to switch identities. Same for the brand
 * homepage and the rider/partner “Switch to Customer App” shortcut.
 */

const PARTNER_PREFIXES = ["/partner"];
const RIDER_PREFIXES = ["/rider"];
const ADMIN_PREFIXES = ["/admin"];
/**
 * Routes that ONLY a logged-in customer (or a guest) should see.
 *
 * কাজ ২ (security) — `/` is now in this list. Previously it was
 * deliberately absent so logged-in riders/partners could "Switch to
 * Customer App" back to the homepage. That brand badge only exists
 * on the partner/rider **auth** pages (where the user isn't logged
 * in yet, so the cookie is empty and these redirects don't fire),
 * so it's safe to lock the homepage down too — a logged-in
 * PARTNER/RIDER/ADMIN hitting `/` via direct URL or stale bookmark
 * gets bounced to their own dashboard.
 *
 * `"/login"` and `"/register"` are still public; cross-role
 * switching requires landing on them.
 */
const CUSTOMER_ONLY_PREFIXES = [
  "/",
  "/restaurants",
  "/dishes",
  "/checkout",
  "/profile",
  "/about",
  "/contact",
  "/help",
  "/offers",
  "/safety",
  "/terms",
  "/privacy",
  "/orders",
];

/** Public pages the role cookie must NEVER bounce off of.
 *  Note: `/` is intentionally NOT in this list — it's now a
 *  CUSTOMER-only page per the কাজ ২ security fix, so a logged-in
 *  partner/rider/admin hitting `/` gets redirected to their own
 *  dashboard by the CUSTOMER_ONLY_PREFIXES rules below. */
const ALWAYS_PUBLIC_PREFIXES = ["/login", "/register"];

/**
 * Admin login is the only /admin/* path that's open to guests —
 * every other admin page requires a JWT. The /admin/login entry
 * itself stays public so the user can actually reach the form
 * before they've signed in.
 */
function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

function isAlwaysPublic(pathname: string): boolean {
  return matchesAny(pathname, ALWAYS_PUBLIC_PREFIXES);
}

function matchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always-public routes bypass every redirect — the brand logo,
  // “Switch to Customer App”, and post-logout navigations all
  // target "/", and cross-role login/register needs to land on
  // /login or /register without us bouncing the user.
  if (isAlwaysPublic(pathname)) {
    return NextResponse.next();
  }

  // /admin/login is the only /admin/* path that's public. Every
  // other admin path needs at least a cookie hint of ADMIN — the
  // client-side RequireAuth does the real check after hydration.
  if (matchesAny(pathname, ADMIN_PREFIXES) && isAdminLoginPath(pathname)) {
    return NextResponse.next();
  }

  // Read the role cookie. `decodeURIComponent` reverses the
  // `encodeURIComponent` we do on the client when setting it.
  const cookie = req.cookies.get("khaidai_role")?.value;
  const role = cookie ? safeDecode(cookie) : null;

  // 0a. ADMIN on a customer-only route → admin dashboard.
  //     Lockdown mirrors PARTNER/RIDER: ADMIN cannot browse the
  //     customer funnel pages even though they technically could
  //     authenticate as one. (Per product decision — keep the
  //     admin surface compact and audit-clean.)
  if (role === "ADMIN" && matchesAny(pathname, CUSTOMER_ONLY_PREFIXES)) {
    return redirect(req, "/admin/dashboard");
  }
  // 1. PARTNER on a customer-only route → partner dashboard.
  if (role === "PARTNER" && matchesAny(pathname, CUSTOMER_ONLY_PREFIXES)) {
    return redirect(req, "/partner/dashboard");
  }
  // 2. RIDER on a customer-only route → rider dashboard.
  if (role === "RIDER" && matchesAny(pathname, CUSTOMER_ONLY_PREFIXES)) {
    return redirect(req, "/rider/dashboard");
  }
  // 3a. CUSTOMER on /admin/* → homepage.
  if (role === "CUSTOMER" && matchesAny(pathname, ADMIN_PREFIXES)) {
    return redirect(req, "/");
  }
  // 3b. PARTNER on /admin/* → partner dashboard.
  if (role === "PARTNER" && matchesAny(pathname, ADMIN_PREFIXES)) {
    return redirect(req, "/partner/dashboard");
  }
  // 3c. RIDER on /admin/* → rider dashboard.
  if (role === "RIDER" && matchesAny(pathname, ADMIN_PREFIXES)) {
    return redirect(req, "/rider/dashboard");
  }
  // 3d. ADMIN on /partner/* → admin dashboard.
  if (role === "ADMIN" && matchesAny(pathname, PARTNER_PREFIXES)) {
    return redirect(req, "/admin/dashboard");
  }
  // 3e. ADMIN on /rider/* → admin dashboard.
  if (role === "ADMIN" && matchesAny(pathname, RIDER_PREFIXES)) {
    return redirect(req, "/admin/dashboard");
  }
  // 3f. Unauthenticated on /admin/* (and not on the public
  //     /admin/login entry handled above) → /admin/login.
  if (!role && matchesAny(pathname, ADMIN_PREFIXES)) {
    return redirect(req, "/admin/login");
  }
  // 3. CUSTOMER on /partner/* → homepage.
  if (role === "CUSTOMER" && matchesAny(pathname, PARTNER_PREFIXES)) {
    return redirect(req, "/");
  }
  // 4. CUSTOMER on /rider/* → homepage.
  if (role === "CUSTOMER" && matchesAny(pathname, RIDER_PREFIXES)) {
    return redirect(req, "/");
  }
  // 5. PARTNER on /rider/* and vice-versa → user's own portal.
  if (
    role === "PARTNER" &&
    !matchesAny(pathname, PARTNER_PREFIXES) &&
    matchesAny(pathname, RIDER_PREFIXES)
  ) {
    return redirect(req, "/partner/dashboard");
  }
  if (
    role === "RIDER" &&
    !matchesAny(pathname, RIDER_PREFIXES) &&
    matchesAny(pathname, PARTNER_PREFIXES)
  ) {
    return redirect(req, "/rider/dashboard");
  }

  return NextResponse.next();
}

function redirect(req: NextRequest, to: string) {
  const url = req.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  return NextResponse.redirect(url, 307);
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Match every path except Next.js internals, the public API, and
 * static files. The negative-lookahead keeps the middleware
 * cheap — we don't want it to run on every image/font fetch.
 *
 * `_next/data` is excluded so that client-side route navigations
 * (which Next issues as RSC data fetches against `_next/data/...`)
 * don't re-run the middleware on every transition. Page-level
 * server components see the role cookie normally via the parallel
 * page navigation that already passed through this middleware.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|assets|.*\\..*).*)",
  ],
};
