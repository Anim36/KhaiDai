"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * Shared header strip for the rider pages (History, Help, Settings).
 *
 * Same chrome as the existing dashboard / earnings / delivery
 * headers so the role pages read as one continuous design system:
 * white bg, bottom border #e5e7eb, padding 20px / 32px,
 * title-block on the left, real NotificationBell on the right.
 *
 * Earlier builds had a static BellIcon here. With the sidebar
 * duplicate also removed in step 7, this is the ONE place riders
 * see their incoming delivery offers.
 */
export function RiderPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Optional right-side action button — e.g. "Withdraw". */
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex flex-col gap-1 leading-normal">
        <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[13px] text-ink-muted">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {action}
        <NotificationBell />
      </div>
    </header>
  );
}
