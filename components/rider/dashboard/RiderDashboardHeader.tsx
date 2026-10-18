"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ToggleSwitch } from "@/components/partner/dashboard/ToggleSwitch";
import { LangToggle } from "@/components/LangToggle";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Top header strip for /rider/dashboard.
 *
 * Two halves:
 *   • Left  — title-block: "Dashboard" heading + a subtitle that
 *             changes tone depending on online state.
 *   • Right — Online / Offline label + iOS-style ToggleSwitch +
 *             real NotificationBell. The toggle is the live UI
 *             surface — flipping it persists via
 *             POST /api/riders/status (so a page refresh keeps
 *             the rider online — see step 1 of the migration).
 *
 * Earlier builds had a second "Online / Offline" indicator pill
 * (a green dot + text) sitting to the left of the toggle. The
 * spec asks for **one** indicator, so the pill was dropped and
 * the toggle is now the single source of truth on the header.
 *
 * Same chrome as the partner dashboard header so the two role
 * dashboards read as one continuous design system.
 */
export function RiderDashboardHeader({
  online,
  onToggleOnline,
  disabled = false,
}: {
  online: boolean;
  onToggleOnline: (next: boolean) => void;
  /**
   * `disabled` flips the toggle into a read-only state for the
   * brief window before the first GET /api/riders/me resolves,
   * or while the zone-blocking modal is open. Both are reasons
   * the dashboard shouldn't let the rider flip a half-loaded
   * profile into "online".
   */
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <header className="flex w-full flex-col gap-3 border-b border-line bg-white px-4 py-4 sm:px-8 sm:py-5 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex min-w-0 flex-col gap-1 leading-normal">
        <h1 className="truncate font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {t("rider.header.title")}
        </h1>
        <p className="truncate text-[13px] text-ink-muted">
          {online ? t("rider.header.online") : t("rider.header.offline")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
        {/* Language toggle — desktop only. On mobile the LangToggle
            lives in the RiderShell mobile topbar. */}
        <div className="hidden md:block">
          <LangToggle />
        </div>

        {/* Toggle + adjacent label. The label is the ONE place we
            show online/offline so there's no duplicate indicator
            on the header. Hidden below `lg` because the rider
            mobile topbar (RiderShell) now renders a matching
            green/gray dot-toggle in its right cluster — the page
            header is the SECOND place riders would see it, and
            the duplicate read as a bug. The full iOS-style switch
            + label stay on desktop (lg+) where the shell topbar
            is hidden. */}
        <div className="hidden items-center gap-2 lg:flex">
          <span
            data-rider-status={online ? "online" : "offline"}
            className={
              "text-[12px] font-semibold " +
              (online ? "text-[#16a34a]" : "text-ink-muted")
            }
          >
            {online ? t("rider.statusCard.online") : t("rider.statusCard.offline")}
          </span>
          <ToggleSwitch
            on={online}
            disabled={disabled}
            onChange={onToggleOnline}
            ariaLabel="Toggle rider availability"
          />
        </div>

        {/* Real NotificationBell with viewport-aware panel —
            replaces the old static bell button. Hidden below `lg`
            because the rider mobile topbar (RiderShell) already
            renders the same bell on its 56-px sticky strip — the
            page header is the SECOND place riders would see it,
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
