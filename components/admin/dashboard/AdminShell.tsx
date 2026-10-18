"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ShieldIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";
import { ResponsiveSidebarShell } from "@/components/layout/ResponsiveSidebarShell";
import { AdminSidebar, type AdminNavKey } from "./AdminSidebar";

function initialsOf(name: string | null | undefined) {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("").toUpperCase() || "A";
}

/**
 * Shared shell for every /admin/* page (except /admin/login).
 *
 *   • Left column (lg+): 260px AdminSidebar (activeKey driven by prop).
 *   • Right column: flex-1 main area — caller-provided header + body.
 *   • Background `#f9fafb` matching the partner dashboard.
 *   • Mobile (< lg): sidebar collapses into a slide-in drawer. The
 *     top bar shows the admin's avatar + name on the left, the
 *     notification bell on the right.
 *
 * Pages render their own page-specific header strip inside this
 * shell so each route owns its own copy + actions.
 */
export function AdminShell({
  activeKey,
  children,
}: {
  activeKey: AdminNavKey;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { avatar } = useUserAvatar(user?.id);
  const t = useT();

  const brand = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
        <ShieldIcon size={20} />
      </span>
      <div className="flex flex-col items-start leading-none">
        <span className="font-display text-[18px] font-extrabold text-brand">
          KhaiDai
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Admin
        </span>
      </div>
    </div>
  );

  return (
    <ResponsiveSidebarShell
      brand={brand}
      sidebar={<AdminSidebar activeKey={activeKey} />}
      drawerLabel="Admin navigation"
      topBarLeft={
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-[12px] font-extrabold text-brand">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initialsOf(user?.name)
            )}
          </span>
          <span className="min-w-0 truncate text-[14px] font-bold text-ink">
            {user?.name ?? "Admin"}
          </span>
        </div>
      }
      topBarRight={<NotificationBell />}
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
