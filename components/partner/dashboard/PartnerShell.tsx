"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PotIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";
import { LangToggle } from "@/components/LangToggle";
import { ResponsiveSidebarShell } from "@/components/layout/ResponsiveSidebarShell";
import { PartnerSidebar, type PartnerNavKey } from "./PartnerSidebar";
import { RestaurantStatusDot } from "./RestaurantStatusDot";

/**
 * Shared shell for every /partner/* page (except /partner/login).
 *
 *   • Left column (lg+): 260px PartnerSidebar.
 *   • Right column: flex-1 main area — caller-provided header + body.
 *   • Background `#f9fafb` matching the original partner dashboard.
 *   • Mobile (< lg): sidebar collapses into a slide-in drawer opened
 *     by a top-bar hamburger button. The top bar shows the
 *     KhaiDai brand mark on the left and the notification bell on
 *     the right so the partner always sees the unread badge even
 *     without opening the drawer.
 *
 * Pages render their own page-specific header strip (e.g.
 * `PartnerDashboardHeader`) inside this shell so each route owns
 * its own copy + actions.
 */
export function PartnerShell({
  activeKey,
  children,
}: {
  activeKey: PartnerNavKey;
  children: ReactNode;
}) {
  // The shell is rendered inside <RequireAuth role="PARTNER"> in
  // each page's orchestrator, so by the time we get here
  // `user.role === "PARTNER"`. We still pull `user` for the brand
  // badge and avatar.
  const { user } = useAuth();
  const t = useT();

  const brandBadge = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
        <PotIcon size={20} />
      </span>
      <div className="flex flex-col items-start leading-none">
        <span className="font-display text-[18px] font-extrabold text-brand">
          KhaiDai
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("partner.roleLabel")}
        </span>
      </div>
    </div>
  );

  const sidebar = <PartnerSidebar activeKey={activeKey} />;

  return (
    <ResponsiveSidebarShell
      brand={brandBadge}
      sidebar={sidebar}
      drawerLabel="Partner navigation"
      topBarLeft={
        // Mobile topbar's left side. Same stacked layout as the
        // desktop sidebar's brand block (KhaiDai wordmark on TOP,
        // role label BELOW it) but compacted for the 56-px-tall
        // topbar: brand icon h-6 w-6, wordmark 12 px, role
        // label 8 px. The vertical stack mirrors the desktop
        // sidebar's column layout, so a partner switching
        // between desktop and mobile gets the same logo-lockup.
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-white">
            <PotIcon size={14} />
          </span>
          <div className="flex min-w-0 flex-col items-start leading-none">
            <span className="font-display text-[12px] font-extrabold leading-none text-brand">
              KhaiDai
            </span>
            <span className="mt-0.5 text-[8px] font-semibold uppercase leading-none tracking-wide text-ink-muted">
              {t("partner.roleLabel")}
            </span>
          </div>
        </div>
      }
      topBarRight={
        // Right side, mobile-only compact controls. Every
        // control is a small (h-7 w-7) circle so the partner
        // mobile topbar reads as a row of dots/icons rather
        // than labeled pills:
        //   - LangToggle (compact)         - emerald 28x28
        //   - RestaurantStatusDot          - 28x28, green when
        //                                    accepting, gray
        //                                    when paused
        //   - NotificationBell
        // The full "Accepting Orders" toggle + Hours Today tile
        // still live in the page header (PartnerDashboardHeader)
        // for the desktop view.
        <div className="flex shrink-0 items-center gap-1">
          <LangToggle compact />
          <RestaurantStatusDot />
          <NotificationBell />
        </div>
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
