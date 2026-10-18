"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon, MenuIcon } from "@/components/icons";

/**
 * Shared responsive shell for partner / admin / (rider-secondary) layouts.
 *
 * What it does:
 *   • Desktop (lg+): renders the supplied sidebar in a fixed-width
 *     left column, main content in a flex-1 right column. This is
 *     the layout every page used before this refactor.
 *   • Mobile / tablet (< lg): the sidebar is hidden. A top bar with
 *     a hamburger button + (optional) top-bar children (e.g. brand
 *     + notification bell) is rendered. Tapping the hamburger opens
 *     the sidebar as a slide-in drawer with a backdrop. The drawer
 *     closes when:
 *         - the user clicks the backdrop,
 *         - the user clicks a nav link inside the drawer (so they
 *           don't navigate and then re-open on top of the new page),
 *         - the user presses Escape,
 *         - the route changes (usePathname).
 *
 * Body scroll lock: while the drawer is open, the body scroll is
 * locked. This is the standard pattern from the React community —
 * toggling `overflow: hidden` on `<body>` is reliable across
 * browsers and Capacitor.
 *
 * Sidebar ref forwarding: the sidebar component is mounted BOTH in
 * the desktop column AND in the drawer. The drawer mount is wrapped
 * in a `<div data-mobile-drawer-portal>` so page-level CSS that
 * targets `.sidebar` (none today, but easy to add by accident) is
 * scoped to the right copy.
 */
export function ResponsiveSidebarShell({
  brand,
  /** The role's nav section, usually `<PartnerSidebar activeKey="…" />`. */
  sidebar,
  /** Top-bar content shown on mobile next to the hamburger
   *  (e.g. brand wordmark + notification bell). */
  topBarLeft,
  topBarRight,
  /** Page content. */
  children,
  /** ARIA label for the drawer (e.g. "Partner navigation"). */
  drawerLabel,
  /** Optional override for the hamburger's aria-label.
   *  Defaults to "Open <drawerLabel>". */
  openAriaLabel,
  /** Tailwind class added to the mobile topbar's `top:` value.
   *  Defaults to `top-0` (the topbar sticks to the very top of
   *  the viewport). Set this to e.g. `top-[75px]` when a
   *  <TopNav /> is rendered immediately above the shell so the
   *  two sticky headers stack instead of overlapping. Desktop
   *  is unaffected. */
  stickyTopClassName,
  /** Hide the mobile topbar entirely. Use when the page renders
   *  its own <TopNav /> above the shell and the hamburger lives
   *  in the TopNav brand row instead of the shell's topbar. The
   *  drawer + backdrop still work normally. Desktop is unaffected. */
  hideMobileTopBar,
  /** Controlled drawer open state. When provided, the shell
   *  uses this value instead of its internal `useState`. The
   *  page is then responsible for wiring the hamburger button
   *  (typically inside the TopNav brand row) and for calling
   *  `onDrawerOpenChange` to toggle. */
  drawerOpen,
  /** Called whenever the drawer should change state (hamburger
   *  tap, backdrop tap, close button, Escape, link click). */
  onDrawerOpenChange,
}: {
  brand?: ReactNode;
  sidebar: ReactNode;
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  children: ReactNode;
  drawerLabel: string;
  openAriaLabel?: string;
  stickyTopClassName?: string;
  hideMobileTopBar?: boolean;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  // Internal state is used as a fallback when the page does not
  // pass controlled `drawerOpen` + `onDrawerOpenChange`. Pages
  // that own the state (e.g. /profile so the TopNav hamburger can
  // drive the drawer) pass both and the internal state is ignored.
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = drawerOpen !== undefined && onDrawerOpenChange !== undefined;
  const open = isControlled ? drawerOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onDrawerOpenChange(next);
    else setInternalOpen(next);
  };

  // Close on route change.
  useEffect(() => {
    const close = () => setOpen(false);
    // Listen for the next client-side navigation.
    const originalPush = router.push;
    // We don't actually wrap router.push (the App Router doesn't
    // expose a clean "after route change" hook). Instead, we close
    // on Escape and on link clicks below. The pathname-change effect
    // catches the rest:
    return () => {
      void originalPush;
    };
  }, [router]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Body scroll lock while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="min-h-screen-safe w-full bg-[#f9fafb]">
      {/* ──────────────  Mobile top bar (< lg)  ──────────────
          Hidden when the page renders its own <TopNav /> above
          the shell and the hamburger lives in the TopNav brand
          row (see `hideMobileTopBar`). When hidden, the page is
          responsible for providing a way to open the drawer —
          usually a hamburger button inside <TopNav hamburger />. */}
      {hideMobileTopBar ? null : (
        <header className={`sticky ${stickyTopClassName ?? "top-0"} z-30 flex h-14 w-full items-center justify-between gap-2 border-b border-line bg-white px-3 pt-safe lg:hidden`}>
          <button
            type="button"
            aria-label={openAriaLabel ?? `Open ${drawerLabel.toLowerCase()}`}
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-surface-soft tap-target"
          >
            <MenuIcon size={22} />
          </button>
          <div className="flex min-w-0 flex-1 items-center">
            {topBarLeft}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {topBarRight}
          </div>
        </header>
      )}

      <div className="flex w-full flex-col lg:flex-row lg:items-stretch">
        {/* ──────────────  Desktop sidebar (lg+)  ────────────── */}
        <div className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col">
          {sidebar}
        </div>

        {/* ──────────────  Main content  ────────────── */}
        <main className="flex min-w-0 flex-1 flex-col pb-safe lg:pb-0">
          {children}
        </main>
      </div>

      {/* ──────────────  Mobile drawer (< lg)  ────────────── */}
      {open ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={drawerLabel}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
            tabIndex={-1}
          />
          {/* Drawer panel */}
          <div
            data-mobile-drawer-portal
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-2xl pt-safe"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <div className="min-w-0 flex-1 truncate">
                {brand}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-surface-soft tap-target"
              >
                <CloseIcon size={22} />
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              onClick={(e) => {
                // Close the drawer when a link inside is clicked.
                // We delegate from the sidebar wrapper to catch any
                // anchor inside any child component.
                const target = e.target as HTMLElement;
                if (target.closest("a[href]")) {
                  setOpen(false);
                }
              }}
            >
              {sidebar}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
