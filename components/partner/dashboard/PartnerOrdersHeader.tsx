"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Top header strip for /partner/orders — same chrome as the
 * dashboard + menu + earnings + reviews headers (Figma
 * `partner-header` frame).
 *
 *   • White bg, bottom border `#e5e7eb`, padding 20px vertical / 32px
 *     horizontal.
 *   • Left = title-block (heading + sub).
 *   • Right = actions-block — NotificationBell only.
 *
 * The restaurant online/offline "Accepting Orders" / "Currently
 * Closed" indicator used to live here as a static green pill; that
 * was misleading because (a) the toggle to actually flip the
 * status lives on the Dashboard, and (b) it never reflected the
 * real state — it was always "Accepting Orders" even when the
 * partner had paused. Bug — Feat 2 restricts it to the Dashboard
 * header only.
 */
export function PartnerOrdersHeader() {
  const t = useT();
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex flex-col gap-1 leading-normal">
        <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {t("partner.orders.title")}
        </h1>
        <p className="text-[13px] text-ink-muted">
          {t("partner.orders.subtitle")}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* Bug — Feat 2: the online/offline "Accepting Orders" /
            "Currently Closed" pill is intentionally scoped to the
            Dashboard header only. Showing a hardcoded green pill
            on Orders / Menu / Earnings / Reviews / Settings
            would lie when the partner has paused the restaurant,
            and create the impression that toggling is achievable
            from these pages (it isn't — the toggle lives on the
            Dashboard). */}
        <NotificationBell />
      </div>
    </header>
  );
}