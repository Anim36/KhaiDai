"use client";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Top header strip for /partner/settings — same chrome as the
 * dashboard + menu + earnings + reviews + orders headers (Figma
 * `partner-header`).
 *
 * Bug 4 fix — replaces the static decorative bell with the shared
 * `<NotificationBell />` so notifications open consistently from
 * every partner sub-page.
 */
export function PartnerSettingsHeader() {
  const t = useT();
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex flex-col gap-1 leading-normal">
        <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {t("partner.settings.title")}
        </h1>
        <p className="text-[13px] text-ink-muted">
          {t("partner.settings.subtitle")}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <NotificationBell />
      </div>
    </header>
  );
}