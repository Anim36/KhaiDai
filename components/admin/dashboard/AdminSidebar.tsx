"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import {
  BarChartIcon,
  ClipboardIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShieldIcon,
  StoreIcon,
  TicketIcon,
  TruckIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { useT } from "@/lib/i18n/LocaleProvider";

/** Two-letter initials derived from the admin's name. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || "A").toUpperCase();
}

/**
 * Admin dashboard sidebar.
 *
 * Layout mirrors `PartnerSidebar.tsx`:
 *   • 260px wide, white bg, right border `#e5e7eb`, 24px padding.
 *   • Brand badge top + 6-item nav.
 *   • Avatar pin anchored to the bottom of the column.
 *
 * Brand badge swaps the partner pot icon for a shield glyph and
 * labels itself "Admin" so the admin always knows which portal
 * they're inside — and the brand-home link points back to
 * `/admin/dashboard`, never the public homepage (admins don't get
 * a customer view; lockdown lives in middleware).
 */
export function AdminSidebar({
  activeKey = "dashboard",
}: {
  activeKey?: AdminNavKey;
}) {
  const t = useT();
  // ধাপ ৬ — Verifications badge. We pull the combined PENDING
  // count from /api/admin/verifications/count once per minute so
  // the admin always sees how many items need approval. The badge
  // caps at "99+" so a runaway number doesn't break the layout.
  const [pendingVerifications, setPendingVerifications] = useState<
    number | null
  >(null);
  // Feat 3 — Unread contact-message badge. Same 60s polling
  // cadence as verifications so the sidebar stays in lockstep.
  const [unreadMessages, setUnreadMessages] = useState<number | null>(null);
  // Feat 5 — pending withdrawal count (combined customer WR + partner
  // / rider payout requests). Pushed via the same 60s tick as the
  // other sidebar badges so the badge caps at "99+".
  const [pendingWithdrawals, setPendingWithdrawals] = useState<number | null>(
    null,
  );
  // Profile-change request queue — riders asking to unlock their
  // locked profile / vehicle fields. Same 60s cadence + 99+ cap
  // as the other badges so the sidebar stays visually consistent.
  const [pendingProfileRequests, setPendingProfileRequests] = useState<
    number | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const [v, m, w, p] = await Promise.all([
        apiFetch<{ count: number }>("/api/admin/verifications/count"),
        apiFetch<{ unreadCount?: number }>("/api/admin/messages"),
        apiFetch<{
          counts?: {
            customer?: { pending: number };
            partner?: { pending: number };
            rider?: { pending: number };
          };
        }>("/api/admin/withdrawals?pageSize=1"),
        apiFetch<{ count: number }>(
          "/api/admin/profile-change-requests/count",
        ),
      ]);
      if (cancelled) return;
      if (v.ok && typeof v.data?.count === "number") {
        setPendingVerifications(v.data.count);
      }
      if (m.ok && typeof m.data?.unreadCount === "number") {
        setUnreadMessages(m.data.unreadCount);
      }
      if (w.ok && w.data?.counts) {
        const total =
          (w.data.counts.customer?.pending ?? 0) +
          (w.data.counts.partner?.pending ?? 0) +
          (w.data.counts.rider?.pending ?? 0);
        setPendingWithdrawals(total);
      }
      if (p.ok && typeof p.data?.count === "number") {
        setPendingProfileRequests(p.data.count);
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  const router = useRouter();
  const { logout, user } = useAuth();
  const onLogout = () => {
    logout();
    router.push("/admin/login");
  };
  const displayName = user?.name ?? "Admin";
  const role = "Platform Administrator";
  const initials = initialsOf(user?.name);
  const navItems: NavItem[] = [
    { key: "dashboard",      label: t("admin.sidebar.dashboard"),      href: "/admin/dashboard",        icon: <LayoutDashboardIcon size={20} /> },
    { key: "analytics",      label: t("admin.sidebar.analytics"),      href: "/admin/analytics",        icon: <BarChartIcon size={20} /> },
    { key: "users",          label: t("admin.sidebar.users"),          href: "/admin/users",            icon: <UsersIcon size={20} /> },
    { key: "restaurants",    label: t("admin.sidebar.restaurants"),    href: "/admin/restaurants",      icon: <StoreIcon size={20} /> },
    { key: "orders",         label: t("admin.sidebar.orders"),         href: "/admin/orders",           icon: <WalletIcon size={20} /> },
    { key: "riders",         label: t("admin.sidebar.riders"),         href: "/admin/riders",           icon: <TruckIcon size={20} /> },
    { key: "delivery",       label: t("admin.sidebar.delivery"),       href: "/admin/settings/delivery", icon: <SettingsIcon size={20} /> },
    { key: "auditLog",       label: t("admin.sidebar.auditLog"),       href: "/admin/audit-log",        icon: <ClipboardIcon size={20} /> },
    { key: "promoCodes",     label: t("admin.sidebar.promoCodes"),     href: "/admin/promo-codes",      icon: <TicketIcon size={20} /> },
    { key: "verifications",  label: t("admin.sidebar.verifications"),  href: "/admin/verifications",    icon: <ShieldIcon size={20} /> },
    { key: "profileRequests", label: t("admin.sidebar.profileRequests"), href: "/admin/profile-requests", icon: <UserCogIcon size={20} /> },
    { key: "messages",       label: t("admin.sidebar.messages"),       href: "/admin/messages",         icon: <InboxIcon size={20} /> },
    { key: "withdrawals",    label: t("admin.sidebar.withdrawals"),    href: "/admin/withdrawals",      icon: <WalletIcon size={20} /> },
  ];

  return (
    <aside
      aria-label="Admin navigation"
      className="w-full md:w-[260px] md:shrink-0 flex flex-col gap-8 border-r border-line bg-white p-6"
    >
      {/* Brand row — KhaiDai wordmark + "ADMIN" sub-tag */}
      <Link
        href="/admin/dashboard"
        data-brand-home="true"
        className="flex items-center gap-2.5"
        aria-label="KhaiDai Admin — go to admin dashboard"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white p-1.5">
          <ShieldIcon size={20} />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="font-display text-[20px] font-extrabold text-brand">
            KhaiDai
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Admin
          </span>
        </span>
      </Link>

      {/* 6 nav items — Dashboard, Users, Restaurants, Orders, Audit, Promo */}
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
              <span>{item.label}</span>
              {item.key === "verifications" && pendingVerifications ? (
                <span
                  aria-label={`${pendingVerifications} pending verifications`}
                  className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white"
                >
                  {pendingVerifications > 99 ? "99+" : pendingVerifications}
                </span>
              ) : null}
              {/* Feat 3 — unread contact-message badge. Same
                  presentation as the verifications badge so the
                  sidebar stays visually consistent. */}
              {item.key === "messages" && unreadMessages ? (
                <span
                  aria-label={`${unreadMessages} unread contact messages`}
                  className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white"
                >
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </span>
              ) : null}
              {/* Feat 5 — pending withdrawal badge. Combined count
                  (customer/partner/rider). Capped at 99+. */}
              {item.key === "withdrawals" && pendingWithdrawals ? (
                <span
                  aria-label={`${pendingWithdrawals} pending withdrawals`}
                  className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white"
                >
                  {pendingWithdrawals > 99 ? "99+" : pendingWithdrawals}
                </span>
              ) : null}
              {/* Profile-change request badge. Same rose-500 +
                  99+ cap as the other moderation counters. */}
              {item.key === "profileRequests" && pendingProfileRequests ? (
                <span
                  aria-label={`${pendingProfileRequests} pending profile requests`}
                  className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white"
                >
                  {pendingProfileRequests > 99
                    ? "99+"
                    : pendingProfileRequests}
                </span>
              ) : null}
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
            {initials}
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
          {t("admin.sidebar.logout")}
        </button>
      </div>
    </aside>
  );
}

export type AdminNavKey =
  | "dashboard"
  | "users"
  | "restaurants"
  | "orders"
  | "riders"
  | "withdrawals"
  | "delivery"
  | "auditLog"
  | "promoCodes"
  /** ধাপ ৬ — admin verification queue for partner + rider approvals. */
  | "verifications"
  /** Feat 3 — public /contact form submissions. */
  | "messages"
  /** Feat 3 — platform-wide analytics dashboard. */
  | "analytics"
  /** Profile-change request queue — riders asking to unlock their
   *  locked profile / vehicle fields. Sits next to Verifications
   *  because both are "moderator inbox" surfaces. */
  | "profileRequests";

type NavItem = {
  key: AdminNavKey;
  label: string;
  href: string;
  icon: React.ReactNode;
};
