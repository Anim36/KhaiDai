"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HelpIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  RiderScooterIcon,
  SettingsIcon,
  TrophyIcon,
  WalletIcon,
} from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { useT } from "@/lib/i18n/LocaleProvider";
// Note: the NotificationBell was moved into the dashboard header
// (real bell + unread badge). The sidebar previously rendered its
// own duplicate bell — removed so the rider only sees ONE.

/** Two-letter initials for the rider avatar. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "R";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || "R").toUpperCase();
}

/**
 * Rider dashboard sidebar (Figma `rider-sidebar` frame).
 *
 * Same chrome as the partner sidebar so the two role dashboards
 * read as one continuous design system — 260px width, white bg,
 * right border #e5e7eb, 24px padding, brand-tile + wordmark at
 * top, 5-item nav in the middle, avatar pin anchored to the
 * bottom.
 *
 * The sidebar itself is presentation-only: the active nav key
 * comes in via `activeKey`, so the same component drives every
 * route in the Rider Panel.
 *
 * Nav items (per the Figma `rider-dashboard` frame):
 *   • Home         → /rider/dashboard   (active by default)
 *   • Earnings     → /rider/earnings    (placeholder for next milestone)
 *   • History      → /rider/history     (placeholder for next milestone)
 *   • Help         → /rider/help        (placeholder for next milestone)
 *   • Settings     → /rider/settings    (placeholder for next milestone)
 *
 * Settings is kept (matching the partner sidebar's six-item nav) so
 * future milestones can add the corresponding routes without
 * revisiting the sidebar's layout.
 */
export function RiderSidebar({
  activeKey = "home",
}: {
  activeKey?: RiderNavKey;
}) {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { avatar } = useUserAvatar(user?.id);
  const t = useT();
  const onLogout = () => {
    logout();
    router.push("/rider/login");
  };
  // Show whoever is actually signed in; pre-hydration falls back to
  // a generic "Rider" so we never flash a hardcoded demo name.
  const displayName = user?.name ?? "Rider";
  const role = "Rider";
  const initials = initialsOf(user?.name);
  return (
    <aside
      aria-label="Rider navigation"
      className="w-full md:w-[260px] md:shrink-0 flex flex-col gap-8 border-r border-line bg-white p-6"
    >
      {/* Brand row — KhaiDai wordmark + "Rider" sub-tag.
          IMPORTANT: this points at /rider/dashboard, NOT the public
          customer homepage ("/"). A logged-in RIDER who clicks the
          logo should land back in their own role home, never in the
          customer app. (See middleware: PARTNER/RIDER are kept out of
          the customer tree regardless.) */}
      <Link
        href="/rider/dashboard"
        data-brand-home="true"
        className="flex items-center gap-2.5"
        aria-label="KhaiDai Rider — go to rider dashboard"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white p-1.5">
          <RiderScooterIcon size={20} />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="font-display text-[20px] font-extrabold text-brand">
            KhaiDai
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Rider
          </span>
        </span>
      </Link>

      {/* Nav */}
      <nav aria-label="Sections" className="flex flex-col gap-2 w-full">
        {navItems.map((item) => {
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] transition-colors " +
                (active
                  ? "bg-[#fff5f3] font-bold text-brand"
                  : "font-medium text-ink hover:bg-surface")
              }
            >
              <span
                className={
                  active
                    ? "text-brand"
                    : "text-ink-muted"
                }
              >
                {item.icon}
              </span>
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Avatar pin + Switch-to-customer-app shortcut. The avatar
          block stays at the column foot via `mt-auto`; the shortcut
          sits beneath it so riders can return to the public site
          in one click without using the browser back button. */}
      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#fff5f3] text-brand font-display text-[14px] font-extrabold">
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
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[14px] font-bold text-ink truncate">
              {displayName}
            </span>
            <span className="text-[11px] text-ink-muted truncate">
              {role}
            </span>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          data-action="logout"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:border-rose-300 hover:text-rose-600"
        >
          {t("rider.nav.logout")}
        </button>
      </div>
    </aside>
  );
}

type RiderNavItem = {
  key: RiderNavKey;
  labelKey: import("@/lib/i18n/LocaleProvider").TranslationKey;
  href: string;
  icon: React.ReactNode;
};

const navItems: RiderNavItem[] = [
  {
    key: "home",
    labelKey: "rider.nav.home",
    href: "/rider/dashboard",
    icon: <LayoutDashboardIcon size={20} />,
  },
  {
    key: "earnings",
    labelKey: "rider.nav.earnings",
    href: "/rider/earnings",
    icon: <WalletIcon size={20} />,
  },
  {
    key: "history",
    labelKey: "rider.nav.history",
    href: "/rider/history",
    icon: <HistoryIcon size={20} />,
  },
  {
    key: "leaderboard",
    labelKey: "rider.nav.leaderboard",
    href: "/rider/leaderboard",
    icon: <TrophyIcon size={20} />,
  },
  {
    key: "help",
    labelKey: "rider.nav.help",
    href: "/rider/help",
    icon: <HelpIcon size={20} />,
  },
  {
    key: "settings",
    labelKey: "rider.nav.settings",
    href: "/rider/settings",
    icon: <SettingsIcon size={20} />,
  },
];

export type RiderNavKey = "home" | "earnings" | "history" | "leaderboard" | "help" | "settings";
