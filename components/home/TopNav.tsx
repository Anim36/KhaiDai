"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CartIcon,
  ChevronIcon,
  CloseIcon,
  MapPinIcon,
  MenuIcon,
  PotIcon,
  SearchIcon,
} from "@/components/icons";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { useCart } from "@/components/restaurants/cart/CartProvider";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LangToggle } from "@/components/LangToggle";
import { useT } from "@/lib/i18n/LocaleProvider";
import {
  shortAddressLabel,
  useDeliveryAddress,
} from "@/contexts/DeliveryAddressContext";

/** Two-letter initials derived from the logged-in user's name. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || "?").toUpperCase();
}

/**
 * Customer-facing top navigation.
 *
 * Responsive behaviour:
 *   • Mobile (< lg) — default:
 *       Row 1: brand (compact) · language · cart · profile/login
 *       Row 2: location pill (full width)
 *       Row 3: search bar (full width)
 *   • Mobile (< lg) — `compactOnMobile`:
 *       Row 1 only: brand · search-icon · language · cart · profile/login
 *       Tapping the search icon opens a full-screen overlay that
 *       contains the location pill + the search input + the live
 *       suggestion panel — same components the full layout uses,
 *       just surfaced on demand so the chrome doesn't eat ~179 px
 *       of vertical space on every page that isn't the home feed.
 *   • Desktop (lg+): single row.
 *       [brand] | [search bar with location pill] | [lang · bell · cart · profile]
 *
 *   The previous version tried to cram everything into a single
 *   80-px-tall row with a fixed 560-px-wide search bar. On 320–414
 *   px phones the bar would overflow horizontally. The split is
 *   the only layout that survives the 320 px breakpoint.
 *
 * `hideLocationAndSearchOnScroll` (mobile only) — opt-in. When
 * true, rows 2 + 3 collapse as the user scrolls DOWN and re-expand
 * on the next scroll-UP (or when the page returns to the top).
 * Used by the homepage so the hero section gets the full viewport
 * once the customer starts browsing. The desktop single-row layout
  * is never affected.
 */
export function TopNav({
  hideLocationAndSearchOnScroll = false,
  compactOnMobile = false,
  hamburger,
}: {
  hideLocationAndSearchOnScroll?: boolean;
  compactOnMobile?: boolean;
  /** When set, the mobile brand row renders a hamburger button
   *  on the LEFT, before the brand. The page wires the tap to
   *  open the sidebar drawer (typically a
   *  <ResponsiveSidebarShell /> with `drawerOpen` +
   *  `onDrawerOpenChange` controlled by the page state). When
   *  this is provided, the page is expected to also pass
   *  `hideMobileTopBar` to the shell so the two don't both
   *  render a hamburger. Desktop (lg+) is unaffected — the
   *  desktop single-row layout doesn't render the hamburger. */
  hamburger?: {
    onClick: () => void;
    open: boolean;
    label: string;
  };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // `searchOverlayOpen` is only meaningful when the page mounted
  // TopNav with `compactOnMobile`. On desktop the inline search bar
  // is always visible, so the overlay state stays false.
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const { count } = useCart();
  const { user, isLoggedIn } = useAuth();
  const t = useT();
  const { avatar } = useUserAvatar(user?.id);
  const initials = initialsOf(user?.name);

  const { address, openPicker } = useDeliveryAddress();
  const locationLabel = shortAddressLabel(address) || t("home.setLocation");
  const locationTitle =
    address?.fullAddress || t("home.clickToChooseLocation");

  // Mobile hide-on-scroll: when the user scrolls DOWN past a small
  // threshold, collapse rows 2 + 3 so the hero section owns the
  // full viewport. On the next scroll UP, re-expand them. Always
  // re-expand at the very top (scrollY <= 8) so a fresh navigation
  // doesn't start with the chrome hidden. Skipped on desktop (lg+)
  // and when the page opts out via the prop.
  //
  // Implementation notes:
  //  - Touch / wheel scrolls often oscillate a few pixels in both
  //    directions, so we use a damped differential rather than a
  //    raw 1-vs-last comparison. The state only flips after
  //    `SCROLL_THRESHOLD` (8 px) of consistent direction; the
  //    accumulated delta resets on direction reversal so a single
  //    big scroll in one direction commits without needing N
  //    frames of evidence.
  //  - We throttle with rAF so a fast flick registers as one
  //    direction, not several tiny flips.
  //  - We skip when the document is shorter than the viewport
  //    (no scroll possible) to avoid the bar getting "stuck" hidden
  //    after a window-resize.
  const SCROLL_THRESHOLD = 12;
  const [rowsExpanded, setRowsExpanded] = useState(true);
  const accumulatedDeltaRef = useRef(0);
  useEffect(() => {
    if (!hideLocationAndSearchOnScroll) return;
    // compactOnMobile never renders the collapsible rows in the
    // first place, so the scroll listener would be a no-op.
    if (compactOnMobile) return;
    // No-op on desktop — the lg:hidden wrapper means rows 2+3
    // don't exist, but the listener would still fire and waste
    // work.
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    if (
      document.documentElement.scrollHeight <=
      window.innerHeight + 8
    ) {
      return;
    }
    let frame = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY;
        lastY = y;
        // Always re-expand at the very top of the page.
        if (y <= 8) {
          setRowsExpanded(true);
          accumulatedDeltaRef.current = 0;
          return;
        }
        // Reset the accumulator if the user changed direction.
        if (
          (accumulatedDeltaRef.current > 0 && delta < 0) ||
          (accumulatedDeltaRef.current < 0 && delta > 0)
        ) {
          accumulatedDeltaRef.current = delta;
        } else {
          accumulatedDeltaRef.current += delta;
        }
        if (accumulatedDeltaRef.current > SCROLL_THRESHOLD) {
          setRowsExpanded(false);
          accumulatedDeltaRef.current = 0;
        } else if (accumulatedDeltaRef.current < -SCROLL_THRESHOLD) {
          setRowsExpanded(true);
          accumulatedDeltaRef.current = 0;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [hideLocationAndSearchOnScroll, compactOnMobile]);

  const submitSearch = () => {
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-white pt-safe">
      {/* ───────────────────  DESKTOP (lg+)  ─────────────────── */}
      <div className="mx-auto hidden h-20 w-full max-w-page items-center justify-between gap-6 px-6 lg:flex xl:px-16">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="KhaiDai — go to homepage"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
            <PotIcon size={24} />
          </span>
          <span className="font-display text-2xl font-extrabold text-brand">
            KhaiDai
          </span>
        </Link>

        <div
          role="search"
          className="flex h-12 w-[560px] min-w-0 items-center gap-2 rounded-3xl bg-surface-soft px-4"
        >
          <button
            type="button"
            onClick={() => openPicker()}
            aria-label={`Delivery location: ${locationLabel}. Click to change.`}
            title={locationTitle}
            className="group flex min-w-0 max-w-[200px] shrink items-center gap-1 rounded-full px-1 py-1 transition hover:bg-white sm:max-w-[220px]"
          >
            <MapPinIcon size={18} className="shrink-0 text-brand" />
            <span
              title={locationTitle}
              className={
                "min-w-0 truncate text-[14px] font-semibold " +
                (address ? "text-ink" : "text-ink-muted")
              }
            >
              {locationLabel}
            </span>
            <ChevronIcon
              size={14}
              className="shrink-0 text-ink-muted transition group-hover:text-brand"
            />
          </button>

          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />

          <div className="relative flex min-w-0 flex-1 items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch();
              }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <button
                type="submit"
                aria-label="Search"
                className="flex shrink-0 items-center justify-center text-ink-muted hover:text-brand"
              >
                <SearchIcon size={18} />
              </button>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                className="min-w-0 w-full bg-transparent text-[14px] font-normal text-ink placeholder:text-ink-muted focus:outline-none"
                aria-label={t("home.searchPlaceholder")}
              />
            </form>
            <SearchSuggestions query={query} onSubmit={submitSearch} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <LangToggle />
          {isLoggedIn ? <NotificationBell /> : null}
          <Link
            href="/checkout"
            aria-label={t("nav.cart") + ` ${count}`}
            className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <CartIcon size={18} />
            {t("nav.cart")} ({count})
          </Link>

          {isLoggedIn && user ? (
            <Link
              href="/profile"
              aria-label="Open profile"
              className="flex items-center gap-2 rounded-2xl px-2 py-1 transition-colors hover:bg-surface-soft"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[18px] bg-brand-50 font-display text-[14px] font-extrabold text-brand"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="text-[15px] font-semibold text-ink">
                {user.name}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              aria-label={t("auth.login")}
              className="flex h-10 items-center justify-center rounded-2xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              {t("auth.login")}
            </Link>
          )}
        </div>
      </div>

      {/* ───────────────────  MOBILE (< lg)  ─────────────────── */}
      {/* The mobile brand row is intentionally tight (h-9 buttons,
          18-px icons, semibold wordmark) so the chrome stays slim
          and doesn't eat into the page content on phones. The
          earlier h-10 / font-extrabold / size={20} combo felt
          heavy on 320–414 px screens and made the row look like
          a banner ad. Desktop (lg+) is unaffected — it has its
          own single-row layout further down with its own sizes. */}
      <div className="flex flex-col gap-2 px-3 py-2.5 xs:px-4 lg:hidden">
        {/* Row 1: brand + lang + cart + profile/login */}
        <div className="flex items-center justify-between gap-1.5">
          {hamburger ? (
            // Hamburger lives in the TopNav brand row on pages
            // that own the sidebar drawer (e.g. /profile). The
            // page is expected to also pass `hideMobileTopBar` to
            // the shell so the two don't both render a hamburger.
            // Sized to match the other h-9 controls in the row
            // (search icon, lang, cart, avatar).
            <button
              type="button"
              onClick={hamburger.onClick}
              aria-label={hamburger.label}
              aria-expanded={hamburger.open}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-soft tap-target"
            >
              <MenuIcon size={20} />
            </button>
          ) : null}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5"
            aria-label="KhaiDai — go to homepage"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
              <PotIcon size={18} />
            </span>
            {/* Wordmark is hidden on extra-narrow phones (< xs) where
                even the icon row is tight on space. Switched from
                font-extrabold to font-semibold to make the
                wordmark feel closer to the other mobile controls
                and stop it from visually dominating the row. */}
            <span className="hidden font-display text-[15px] font-semibold text-brand xs:inline">
              KhaiDai
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {/* Search icon — only on mobile, only when the page asked
                for compactOnMobile. On desktop the search bar lives
                in the single row layout (further down in this file)
                and the icon is redundant. Tapping the icon opens a
                full-screen search overlay that contains the same
                location pill + search input + suggestions the
                expanded mobile layout would show inline. */}
            <button
              type="button"
              onClick={() => setSearchOverlayOpen(true)}
              aria-label="Open search"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-soft tap-target lg:hidden"
            >
              <SearchIcon size={18} />
            </button>
            <LangToggle />
            {isLoggedIn ? <NotificationBell /> : null}
            <Link
              href="/checkout"
              aria-label={t("nav.cart") + ` ${count}`}
              className="relative flex h-9 min-w-[36px] items-center justify-center gap-1 rounded-lg bg-brand px-2 text-[12px] font-semibold text-white"
            >
              <CartIcon size={16} />
              <span className="sr-only">{t("nav.cart")}</span>
              {count > 0 ? (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand ring-2 ring-brand"
                >
                  {count}
                </span>
              ) : null}
            </Link>

            {isLoggedIn && user ? (
              <Link
                href="/profile"
                aria-label="Open profile"
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-[12px] font-bold text-brand"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </Link>
            ) : (
              <Link
                href="/login"
                aria-label={t("auth.login")}
                className="flex h-9 items-center justify-center rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white xs:px-3"
              >
                <span className="hidden xs:inline">{t("auth.login")}</span>
                {/* Compact login indicator on extra-narrow screens. */}
                <span className="xs:hidden">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* Row 2 + Row 3 are hidden entirely on pages that opt in
            via `compactOnMobile` — those pages surface the same
            controls inside a full-screen overlay (see
            <SearchOverlay /> below) reached by tapping the search
            icon in the brand row. Otherwise, rows 2 + 3 collapse
            together when the homepage opts in via
            hideLocationAndSearchOnScroll. The wrapper uses
            `grid-rows-[1fr]` ↔ `grid-rows-[0fr]` (the modern
            `transition-[grid-template-rows]` pattern) so the
            children stay in normal flow when expanded and clip
            cleanly when collapsed. A small `overflow-hidden` +
            `aria-hidden` pair keeps the location button + search
            input out of the tab order while they're invisible. */}
        {!compactOnMobile ? (
          <div
            className={
              // Animate a fixed `max-height` instead of `grid-template-rows`.
              // The grid-rows trick (1fr ↔ 0fr) is the modern height-transition
              // pattern, but on mobile the inner row has a fixed `h-10` so the
              // browser re-lays-out every frame, which makes the pills visibly
              // tremble instead of gliding. max-height transitions interpolate
              // cleanly and avoid the mid-animation re-layout.
              "overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none " +
              (rowsExpanded
                ? "max-h-[120px] opacity-100"
                : "max-h-0 opacity-0")
            }
            aria-hidden={!rowsExpanded}
          >
            <div className="flex min-h-0 flex-col gap-1.5">
              {/* Row 2: location pill (full width, truncated) */}
              <button
                type="button"
                onClick={() => openPicker()}
                tabIndex={rowsExpanded ? 0 : -1}
                aria-label={`Delivery location: ${locationLabel}. Click to change.`}
                title={locationTitle}
                className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl bg-surface-soft px-3"
              >
                <MapPinIcon size={16} className="shrink-0 text-brand" />
                <span
                  className={
                    "min-w-0 flex-1 truncate text-left text-[13px] font-medium " +
                    (address ? "text-ink" : "text-ink-muted")
                  }
                >
                  {locationLabel}
                </span>
                <ChevronIcon
                  size={14}
                  className="shrink-0 text-ink-muted"
                />
              </button>

              {/* Row 3: search bar (full width) */}
              <div
                role="search"
                className="relative flex h-10 w-full min-w-0 items-center gap-2 rounded-xl bg-surface-soft px-3"
              >
                <SearchIcon size={16} className="shrink-0 text-ink-muted" />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitSearch();
                  }}
                  className="flex min-w-0 flex-1 items-center"
                >
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    tabIndex={rowsExpanded ? 0 : -1}
                    placeholder={t("home.searchPlaceholder")}
                    className="min-w-0 w-full bg-transparent text-[14px] font-normal text-ink placeholder:text-ink-muted focus:outline-none"
                    aria-label={t("home.searchPlaceholder")}
                  />
                </form>
                <SearchSuggestions query={query} onSubmit={submitSearch} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ───────────  Compact-mobile search overlay  ───────────
          Rendered only when the page asked for `compactOnMobile`.
          A full-screen panel that contains the same location pill
          + search input the inline layout would have shown. Uses
          the existing <SearchSuggestions /> so the live-search
          behaviour is identical to the expanded layout. */}
      {compactOnMobile && searchOverlayOpen ? (
        <SearchOverlay
          query={query}
          setQuery={setQuery}
          submitSearch={submitSearch}
          locationLabel={locationLabel}
          locationTitle={locationTitle}
          address={address}
          openPicker={openPicker}
          onClose={() => setSearchOverlayOpen(false)}
        />
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compact-mobile search overlay                                            */
/* -------------------------------------------------------------------------- */

/**
 * Full-screen mobile search panel — mirrors the inline location pill +
 * search input + suggestion dropdown the expanded mobile layout would
 * have shown, but reachable from a search-icon tap on the brand row.
 *
 * Only mounted on pages that mount <TopNav compactOnMobile />. Closes
 * on:
 *   • backdrop tap
 *   • Escape key
 *   • the inline close button
 *   • a successful submit (the overlay unmounts as the page navigates)
 *
 * Body scroll is locked while open.
 */
function SearchOverlay({
  query,
  setQuery,
  submitSearch,
  locationLabel,
  locationTitle,
  address,
  openPicker,
  onClose,
}: {
  query: string;
  setQuery: (q: string) => void;
  submitSearch: () => void;
  locationLabel: string;
  locationTitle: string;
  address: import("@/contexts/DeliveryAddressContext").DeliveryAddress | null;
  openPicker: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Body scroll lock while the overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-focus the input on mount so the customer can start typing
  // immediately. We delay a tick so the iOS / Android soft-keyboard
  // transition has time to start before we steal focus.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden"
    >
      {/* Top bar: back + search input. */}
      <div className="flex h-14 w-full items-center gap-2 border-b border-line bg-white px-3 pt-safe">
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-surface-soft tap-target"
        >
          <CloseIcon size={22} />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface-soft px-3 h-10"
        >
          <SearchIcon size={18} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for restaurants, cuisines, or dishes…"
            className="min-w-0 w-full bg-transparent text-[14px] font-normal text-ink placeholder:text-ink-muted focus:outline-none"
            aria-label="Search"
          />
        </form>
      </div>

      {/* Location pill (so the user can still change their delivery
          address from inside the search). */}
      <div className="border-b border-line bg-white px-3 py-3">
        <button
          type="button"
          onClick={openPicker}
          aria-label={`Delivery location: ${locationLabel}. Click to change.`}
          title={locationTitle}
          className="flex h-11 w-full min-w-0 items-center gap-2 rounded-2xl bg-surface-soft px-3"
        >
          <MapPinIcon size={18} className="shrink-0 text-brand" />
          <span
            className={
              "min-w-0 flex-1 truncate text-left text-[13px] font-semibold " +
              (address?.fullAddress ? "text-ink" : "text-ink-muted")
            }
          >
            {locationLabel}
          </span>
          <ChevronIcon size={14} className="shrink-0 text-ink-muted" />
        </button>
      </div>

      {/* Live-search suggestions (same component the inline layout
          uses, so the result list behaves identically). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SearchSuggestions query={query} onSubmit={submitSearch} />
      </div>
    </div>
  );
}
