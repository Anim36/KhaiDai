"use client";

/**
 * Compact language switcher for the navbar. Renders a SINGLE pill
 * that shows the language you'd switch TO if you clicked it:
 *
 *   • Currently `en` → button reads "বাং" (click → Bangla)
 *   • Currently `bn` → button reads "EN"  (click → English)
 *
 * This is the standard "one-button switcher" pattern from iOS /
 * Material / Twitter — the user sees the destination, not the
 * current state, and one tap is all it takes. The previous
 * two-pill segmented control (EN | বাং, with the active one
 * highlighted) took twice the horizontal space, said nothing the
 * flag-style active pill didn't already say, and on the
 * <lg mobile brand row the two pills were the largest single
 * UI element and dominated the chrome.
 *
 * Visual: small emerald pill, white text, 12-px label, soft
 * shadow. Sized to match the other mobile brand-row controls
 * (h-9 w-9 buttons, 18-px icons) so the chrome feels uniform.
 *
 * Used on every role navbar:
 *   • Home TopNav (desktop + mobile)
 *   • PartnerDashboardHeader (desktop, hidden < md)
 *   • RiderDashboardHeader   (desktop, hidden < md)
 * Fixing the component here propagates everywhere — callers do
 * not need to change.
 */

import { useEffect } from "react";

import { useLocale, useT, type Locale } from "@/lib/i18n/LocaleProvider";

// Display labels for the two locales (NOT translated — "EN" and
// "বাং" are the canonical short labels in both English and
// Bangla). Kept as a static lookup so the single-button shape
// reads correctly regardless of which locale is active.
const SHORT_LABEL: Record<Locale, string> = {
  en: "EN",
  bn: "বাং",
};

export function LangToggle({
  className,
  compact = false,
}: {
  className?: string;
  /** When true, render a tiny label-less circle (just an
   *  emerald dot with a 2-letter target glyph in white). Used
   *  on the partner mobile topbar where every pixel of
   *  horizontal space is fought over and the partner already
   *  knows what the dot means (the page header has the full
   *  pill version). Aria-label and title still explain the
   *  action to screen readers. */
  compact?: boolean;
}) {
  const { locale, setLocale } = useLocale();
  const t = useT();

  // The button advertises the locale you'd land on after a click,
  // i.e. the *opposite* of the current one.
  const target: Locale = locale === "en" ? "bn" : "en";
  const label = SHORT_LABEL[target];

  // Keep <html lang="..."> in sync so screen readers / browser
  // spell-check pick up the active language.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <button
      type="button"
      onClick={() => setLocale(target)}
      aria-label={
        locale === "en"
          ? t("lang.switchToBangla")
          : t("lang.switchToEnglish")
      }
      title={
        locale === "en"
          ? t("lang.switchToBangla")
          : t("lang.switchToEnglish")
      }
      className={
        (compact
          ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold leading-none text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 "
          : "inline-flex h-7 min-w-[36px] items-center justify-center rounded-full bg-emerald-600 px-2.5 text-[12px] font-semibold leading-none text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 ") +
        (className ?? "")
      }
    >
      {label}
    </button>
  );
}