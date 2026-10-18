"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Top header strip for /partner/reviews — same visual chrome as the
 * dashboard + menu + earnings headers (Figma `partner-header`).
 *
 *   • White bg, bottom border `#e5e7eb`, padding 20px vertical / 32px
 *     horizontal.
 *   • Left = title-block (heading + sub).
 *   • Right = actions-block — NotificationBell only.
 *
 * The restaurant online/offline "Accepting Orders" / "Currently
 * Closed" indicator was removed from this header (Bug — Feat 2).
 * The toggle to flip the status lives on the Dashboard, and a
 * static "Accepting Orders" pill here would always lie about the
 * real state when the partner had paused their restaurant.
 */
export function PartnerReviewsHeader() {
  const t = useT();
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex flex-col gap-1 leading-normal">
        <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {t("partner.reviews.title")}
        </h1>
        <p className="text-[13px] text-ink-muted">
          {t("partner.reviews.subtitle")}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <NotificationBell />
      </div>
    </header>
  );
}