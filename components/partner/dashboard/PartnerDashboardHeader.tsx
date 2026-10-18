"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { RestaurantStatusToggle } from "@/components/partner/dashboard/RestaurantStatusToggle";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LangToggle } from "@/components/LangToggle";
import { useT } from "@/lib/i18n/LocaleProvider";

/** Pull the first name off a full name. Falls back to "Partner". */
function firstName(full: string | null | undefined): string {
  if (!full) return "Partner";
  const first = full.trim().split(/\s+/)[0];
  return first || "Partner";
}

/**
 * White header strip that sits at the top of the main content column
 * (Figma `partner-header` frame, data-node-id 4:1791).
 *
 *   - White bg, bottom border `#e5e7eb`, padding 20px vertical / 32px
 *     horizontal.
 *   - Left = title-block (heading + sub-heading).
 *   - Right = actions-block — `<RestaurantStatusToggle />` (Accepting
 *     Orders pill + Hours today tile, both real and persistent
 *     across refreshes) + the shared `<NotificationBell />` reused
 *     from the rider dashboard. কাজ ৩ — the prior demo bell slot
 *     was a non-functional outline icon. We replace it with the
 *     real `NotificationBell` so the partner gets live unread
 *     notifications, with the same portal-based viewport-clamping
 *     fix used by the rider header.
 *   - The language toggle (EN / বাং) sits at the front of the
 *     right-actions group.
 */
export function PartnerDashboardHeader() {
  const { user } = useAuth();
  const t = useT();
  // Pre-hydration we show a generic greeting so the heading never
  // flashes a hardcoded demo name.
  const greetingName = firstName(user?.name);
  return (
    <header className="flex w-full flex-col gap-3 border-b border-line bg-white px-4 py-4 sm:px-8 sm:py-5 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex min-w-0 flex-col gap-1 leading-normal">
        <h1 className="truncate font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {t("partner.sections.dashboard")}
        </h1>
        <p className="truncate text-[13px] text-ink-muted">
          {t("partner.headerSubtitle").replace("{name}", greetingName)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
        {/* Mobile: hide the redundant language toggle (it's in
            the responsive top-bar drawer). Desktop: show it so
            partners can switch without opening the drawer. */}
        <div className="hidden md:block">
          <LangToggle />
        </div>

        {/* কাজ ২ — real "Accepting Orders" toggle + active hours tile.
            Replaces the previous hardcoded green-dot pill + placeholder
            hours. State persists via /api/restaurants/me + /api/restaurants/status.
            Hidden below `lg` because the partner mobile topbar
            (PartnerShell) renders a matching <RestaurantStatusDot />
            in its right cluster — the page header is the SECOND
            place partners would see it, and the duplicate read as
            a bug. The full toggle + Hours Today tile stay on
            desktop (lg+) where the shell topbar is hidden. */}
        <div className="hidden lg:block">
          <RestaurantStatusToggle />
        </div>

        {/* কাজ ৩ — single shared NotificationBell. The previous
            outline bell was decorative; this one polls
            /api/notifications, shows the unread count, and opens
            the portal-mounted panel that cannot be clipped by
            parent overflow. Hidden below `lg` because the
            partner mobile topbar (ResponsiveSidebarShell) already
            renders the same bell on its 56-px sticky strip - the
            page header is the SECOND place partners would see it,
            and the duplicate read as a bug. The full bell + unread
            count + panel work normally on desktop (lg+) where the
            shell topbar is hidden. */}
        <div className="hidden lg:block">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}