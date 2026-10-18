"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  HomeIcon,
  WalletIcon,
  HistoryIcon,
  TrophyIcon,
  SettingsIcon,
  MenuIcon,
  CloseIcon,
  PotIcon,
} from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";
import { LangToggle } from "@/components/LangToggle";
import { RiderSidebar, type RiderNavKey } from "./RiderSidebar";

/* ---------------------------------------------------------------------------
 * RiderShell
 * ---------------------------------------------------------------------------
 *
 * Why this shell is different from `PartnerShell` and `AdminShell`:
 *
 *   Riders use the app with **one hand**, often in a phone mount on
 *   a scooter. A bottom tab bar sits where the thumb naturally rests
 *   and gives **1-tap** access to the four most-used screens
 *   (Home, Earnings, History, Leaderboard). A drawer-style
 *   hamburger requires two taps (open + tap link) and is harder to
 *   hit while riding.
 *
 *   The drawer is kept as a **secondary** affordance for the
 *   less-frequent items (Help, Settings, Logout) — accessed via the
 *   hamburger in the top-LEFT of the mobile top bar (matching the
 *   partner / admin shells so all three role dashboards share the
 *   same chrome).
 *
 *   The desktop layout (lg+) keeps the original left sidebar.
 * --------------------------------------------------------------------------- */

const BOTTOM_TABS = [
  { key: "home", href: "/rider/dashboard", icon: HomeIcon, labelKey: "rider.nav.home" },
  { key: "earnings", href: "/rider/earnings", icon: WalletIcon, labelKey: "rider.nav.earnings" },
  { key: "history", href: "/rider/history", icon: HistoryIcon, labelKey: "rider.nav.history" },
  { key: "leaderboard", href: "/rider/leaderboard", icon: TrophyIcon, labelKey: "rider.nav.leaderboard" },
  { key: "settings", href: "/rider/settings", icon: SettingsIcon, labelKey: "rider.nav.settings" },
] as const;

export function RiderShell({
  activeKey,
  children,
  /**
   * When provided, the mobile topbar shows a compact
   * Online/Offline dot-toggle (h-7 w-7, green when online,
   * gray when offline) so the rider can flip availability
   * without scrolling down to the dashboard header. The
   * `disabled` flag mirrors the dashboard header's behaviour
   * — used while the rider profile is loading or the
   * zone-blocking modal is open.
   */
  online,
  onToggleOnline,
  onlineToggleDisabled = false,
}: {
  activeKey: RiderNavKey;
  children: ReactNode;
  online?: boolean;
  onToggleOnline?: (next: boolean) => void;
  onlineToggleDisabled?: boolean;
}) {
  const pathname = usePathname();
  const t = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Body scroll lock while drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Close drawer on route change. We track the previous pathname in
  // a ref so this effect only fires on *actual* navigations — NOT
  // when `drawerOpen` flips (which was the previous behaviour: the
  // effect listed `drawerOpen` as a dep, so the moment the user
  // tapped the hamburger the effect re-ran, saw `drawerOpen` was
  // now `true`, and immediately set it back to `false` — making
  // the drawer impossible to open).
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    setDrawerOpen(false);
  }, [pathname]);

  const brand = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
        <PotIcon size={20} />
      </span>
      <div className="flex flex-col items-start leading-none">
        <span className="font-display text-[18px] font-extrabold text-brand">
          KhaiDai
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Rider
        </span>
      </div>
    </div>
  );

  const sidebar = <RiderSidebar activeKey={activeKey} />;

  return (
    <div className="min-h-screen-safe w-full bg-[#f9fafb]">
      {/* ───────────  Mobile top bar  ───────────
          Same chrome as the partner mobile topbar so both role
          dashboards read as one continuous design system:
          hamburger (left) + KhaiDai brand wordmark + role
          label, then a right-hand cluster of small (h-7 w-7)
          compact controls (LangToggle + NotificationBell). The
          partner additionally has a RestaurantStatusDot in
          that right cluster — riders don't have an equivalent
          "accepting orders" affordance, so we stop at the bell.
          The rider's name lives in the sidebar footer (opened
          via this hamburger) and the dashboard header — both
          stay as today. */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-2 border-b border-line bg-white px-3 pt-safe lg:hidden">
        {/* Hamburger on the LEFT (was on the right) — opens the drawer */}
        <button
          type="button"
          aria-label="Open rider menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-surface-soft tap-target"
        >
          <MenuIcon size={22} />
        </button>

        {/* Brand block — mirrors the partner mobile topbar so the
            two role dashboards feel like one app: brand icon
            (h-6 w-6) + "KhaiDai" 12px wordmark + 8px role label. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-white">
            <PotIcon size={14} />
          </span>
          <div className="flex min-w-0 flex-col items-start leading-none">
            <span className="font-display text-[12px] font-extrabold leading-none text-brand">
              KhaiDai
            </span>
            <span className="mt-0.5 text-[8px] font-semibold uppercase leading-none tracking-wide text-ink-muted">
              Rider
            </span>
          </div>
        </div>

        {/* Right cluster — compact controls. Same h-7 w-7
            circle pattern as the partner mobile topbar
            (LangToggle + RestaurantStatusDot + NotificationBell).
            The rider doesn't have a per-restaurant "accepting
            orders" status, but it DOES have an online/offline
            availability toggle — so we render a matching
            green/gray dot in the same slot. The dashboard
            page header still has the full iOS-style switch on
            desktop (lg+) for discoverability; on mobile the
            header version is hidden (see RiderDashboardHeader)
            so there's only ONE place to toggle. */}
        <div className="flex shrink-0 items-center gap-1">
          <LangToggle compact />
          {typeof online === "boolean" && onToggleOnline ? (
            <button
              type="button"
              role="switch"
              aria-checked={online}
              aria-label={
                online
                  ? t("rider.statusCard.online")
                  : t("rider.statusCard.offline")
              }
              title={
                online
                  ? t("rider.statusCard.online")
                  : t("rider.statusCard.offline")
              }
              data-action="toggle-rider-online-mobile"
              data-rider-online={online}
              disabled={onlineToggleDisabled}
              onClick={() => onToggleOnline(!online)}
              className={
                "inline-flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 " +
                (online
                  ? "bg-[#dcfce7] focus-visible:ring-[#16a34a]/40"
                  : "bg-surface-soft focus-visible:ring-ink-muted/40")
              }
            >
              <span
                aria-hidden
                className={
                  "h-2.5 w-2.5 rounded-full " +
                  (online ? "bg-[#16a34a]" : "bg-ink-muted")
                }
              />
            </button>
          ) : null}
          <NotificationBell />
        </div>
      </header>

      <div className="flex w-full flex-col lg:flex-row lg:items-stretch">
        {/* Desktop sidebar (lg+). */}
        <div className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col">
          {sidebar}
        </div>
        <main className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ───────────  Mobile bottom tab bar  ─────────── */}
      <nav
        aria-label="Rider sections"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-safe shadow-[0_-2px_8px_rgba(0,0,0,0.04)] lg:hidden"
      >
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || activeKey === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors " +
                (active
                  ? "text-brand"
                  : "text-ink-muted hover:text-ink")
              }
            >
              <Icon size={22} className="shrink-0" />
              <span className="truncate">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* ───────────  Drawer for less-frequent items  ─────────── */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Rider menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
            tabIndex={-1}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-2xl pt-safe">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <div className="min-w-0 flex-1 truncate">{brand}</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-surface-soft tap-target"
              >
                <CloseIcon size={22} />
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("a[href]")) setDrawerOpen(false);
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
