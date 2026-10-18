"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChartIcon,
  ChefHatIcon,
  LayoutDashboardIcon,
  PotIcon,
  SettingsIcon,
  StarIcon,
  TicketIcon,
  WalletIcon,
} from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { useT } from "@/lib/i18n/LocaleProvider";

/** Two-letter initials derived from the partner's name. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "P";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || "P").toUpperCase();
}

/**
 * Partner dashboard sidebar (Figma `sidebar` frame).
 *
 * Layout:
 *   • 260px wide, white bg, right border `#e5e7eb`, 24px padding.
 *   • Brand badge top + 6-item nav (32px gap to profile pin).
 *   • Avatar pin anchored to the bottom of the column.
 *
 * The sidebar itself is presentation-only: the active nav key comes
 * in via `activeKey`, so the same component could later drive a
 * /partner/menu, /partner/earnings, etc. view just by changing the
 * parent. Per the current spec only `/partner/dashboard` exists; the
 * other 5 nav items point at placeholder routes that the next set of
 * milestones will fill in.
 */
export function PartnerSidebar({
  activeKey = "dashboard",
}: {
  activeKey?: PartnerNavKey;
}) {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { avatar } = useUserAvatar(user?.id);
  const t = useT();
  const onLogout = () => {
    logout();
    router.push("/partner/login");
  };
  // Show whoever is actually signed in — fall back to a generic
  // "Partner" label during the brief pre-hydration tick.
  const displayName = user?.name ?? "Partner";
  const role = user?.role === "PARTNER" ? t("partner.roleLabel") : "Partner";
  const initials = initialsOf(user?.name);
  return (
    <aside
      aria-label="Partner navigation"
      className="w-full md:w-[260px] md:shrink-0 flex flex-col gap-8 border-r border-line bg-white p-6"
    >
      {/* Brand row — KhaiDai wordmark + "PARTNER" sub-tag (Figma 4:1754).
          IMPORTANT: this points at /partner/dashboard, NOT the public
          customer homepage ("/"). A logged-in PARTNER who clicks the
          logo should land back in their own role home, never in the
          customer app. (See middleware: PARTNER/RIDER are kept out of
          the customer tree regardless.) */}
      <Link
        href="/partner/dashboard"
        data-brand-home="true"
        className="flex items-center gap-2.5"
        aria-label="KhaiDai Partner — go to partner dashboard"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white p-1.5">
          <PotIcon size={20} />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="font-display text-[20px] font-extrabold text-brand">
            KhaiDai
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Partner
          </span>
        </span>
      </Link>

      {/* 6 nav items — Dashboard + 5 placeholders pointing at future routes. */}
      <nav aria-label="Sections" className="flex flex-col gap-2 w-full">
        {navItems.map((item) => {
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] " +
                (active
                  ? "bg-[#ffebe8] font-bold text-brand"
                  : "bg-transparent font-medium text-ink-muted hover:bg-surface hover:text-ink")
              }
            >
              <span className={active ? "text-brand" : "text-ink-muted"}>
                {item.icon}
              </span>
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Profile pin — avatar + name + role. Anchored to the bottom via
          `mt-auto` so it sits at the column foot regardless of body
          height, matching the Figma spec. */}
      <div className="mt-auto flex flex-col gap-4 w-full">
        <div className="h-px w-full bg-line" aria-hidden />
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[20px] bg-[#ffebe8] font-bold text-brand"
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
          </div>
          <div className="flex flex-col leading-tight">
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
          {t("partner.nav.logout")}
        </button>
      </div>
    </aside>
  );
}

export type PartnerNavKey =
  | "dashboard"
  | "orders"
  | "menu"
  | "promoCodes"
  | "earnings"
  | "analytics"
  | "reviews"
  | "settings";

type NavItem = {
  key: PartnerNavKey;
  labelKey: import("@/lib/i18n/LocaleProvider").TranslationKey;
  href: string;
  icon: React.ReactNode;
};

/**
 * Nav items — Dashboard is a live link; Orders/Menu/Earnings/Reviews/
 * Settings point at future routes the next milestones will build.
 * Each `icon` uses the same `currentColor` stroke pattern so the
 * active/inactive colour swap works via the parent text colour.
 * `labelKey` points at `messages/{en,bn}.json:partner.nav.*` so the
 * sidebar switches with the rest of the partner dashboard.
 */
const navItems: NavItem[] = [
  {
    key: "dashboard",
    labelKey: "partner.nav.dashboard",
    href: "/partner/dashboard",
    icon: <LayoutDashboardIcon size={20} />,
  },
  {
    key: "orders",
    labelKey: "partner.nav.orders",
    href: "/partner/orders",
    icon: <WalletIcon size={20} />,
  },
  {
    key: "menu",
    labelKey: "partner.nav.menu",
    href: "/partner/menu",
    icon: <ChefHatIcon size={20} />,
  },
  {
    key: "promoCodes",
    labelKey: "partner.nav.promoCodes",
    href: "/partner/promo-codes",
    icon: <TicketIcon size={20} />,
  },
  {
    key: "earnings",
    labelKey: "partner.nav.earnings",
    href: "/partner/earnings",
    icon: <WalletIcon size={20} />,
  },
  {
    key: "analytics",
    labelKey: "partner.nav.analytics",
    href: "/partner/analytics",
    icon: <BarChartIcon size={20} />,
  },
  {
    key: "reviews",
    labelKey: "partner.nav.reviews",
    href: "/partner/reviews",
    icon: <StarIcon size={20} />,
  },
  {
    key: "settings",
    labelKey: "partner.nav.settings",
    href: "/partner/settings",
    icon: <SettingsIcon size={20} />,
  },
];
