"use client";

import Link from "next/link";
import { PotIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Shared shell for the customer /login and /register pages.
 *
 * Split-screen layout matching the partner-login pattern but tuned for
 * the customer design system:
 *   • Left  — dark food hero with overlay, brand badge, headline,
 *             supporting paragraph (kept lightweight — no stat bar
 *             here, that was partner-specific).
 *   • Right — 520px form panel, white background, vertical padding
 *             to keep form comfortable on tall screens.
 *
 * Reuses the existing customer-style tokens (Outfit via font-display,
 * brand red, ink, surface) so the page reads as part of the
 * KhaiDai homepage rather than a separate product.
 *
 * The form body is rendered as `children` so each route owns its own
 * field set + validation.
 */
export function CustomerAuthLayout({
  children,
  footerNote,
}: {
  children: React.ReactNode;
  footerNote: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white">
      <CustomerHeroPanel />

      <div className="w-full md:w-[520px] md:shrink-0 flex-1 flex items-center justify-center bg-white px-6 py-12 md:px-12 md:py-16">
        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Brand row — mirrors the homepage TopNav badge so the page
              reads as part of the same chrome. */}
          <Link
            href="/"
            aria-label="KhaiDai — go to homepage"
            className="flex items-center gap-2.5 w-fit"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
              <PotIcon size={24} />
            </span>
            <span className="font-display text-2xl font-extrabold text-brand">
              KhaiDai
            </span>
          </Link>

          {children}

          <p className="text-center text-[14px] text-ink-muted mt-2">
            {footerNote}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Left half — full-bleed food image with 75%-opacity overlay (matches
 * the partner-login overlay value so the brand language stays in sync)
 * plus the brand badge, headline, and supporting paragraph. We reuse
 * the existing `hero-bg.png` already on disk.
 */
function CustomerHeroPanel() {
  const t = useT();
  return (
    <aside
      className="relative hidden md:flex md:w-[calc(100%-520px)] md:flex-1 items-start justify-start p-16 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/assets/hero-bg.png')" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[rgba(17,24,39,0.75)]" />

      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Brand badge — same as the navbar, but the logo wordmark is
            white on dark instead of brand-red, matching how the
            partner-login hero renders it. */}
        <div className="flex items-center gap-2.5 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
            <PotIcon size={24} />
          </span>
          <span className="font-display text-2xl font-extrabold leading-none">
            KhaiDai
          </span>
        </div>

        {/* Bottom-anchored copy block. mt-auto pins it to the bottom
            regardless of viewport height. */}
        <div className="mt-auto flex max-w-[480px] flex-col gap-6 text-white">
          <h1 className="font-display font-extrabold leading-[1.15] text-[44px]">
            {t("auth.loginHeroTitle")}
          </h1>
          <p className="text-[18px] font-normal leading-[1.5] opacity-85">
            {t("auth.loginHeroSubtitle")}
          </p>
        </div>
      </div>
    </aside>
  );
}

/**
 * Inline link helper used at the bottom of each form to swap between
 * login and register ("Don't have an account? Register" etc.).
 */
export function CustomerAuthFooterLink({
  prompt,
  cta,
  href,
}: {
  prompt: string;
  cta: string;
  href: string;
}) {
  return (
    <>
      {prompt}{" "}
      <Link href={href} className="font-bold text-brand hover:underline">
        {cta}
      </Link>
    </>
  );
}
