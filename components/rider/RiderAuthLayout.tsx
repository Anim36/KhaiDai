"use client";

import Link from "next/link";
import { RiderScooterIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Shared two-column shell for the Rider auth flow (/rider/login +
 * /rider/register).
 *
 * Visually mirrors PartnerAuthLayout but with its own hero copy +
 * brand glyph (RiderScooterIcon). The 600px form panel / dark hero
 * split keeps the layout idiomatic with the rest of the auth flow.
 *
 *   • Left  — dark hero with a scooter-on-the-road image, brand
 *             badge top-left, headline + supporting copy + 3-stat
 *             bar bottom-left.
 *   • Right — form panel. 600px fixed width on md+, full width
 *             below md. White bg, 80px / 64px padding on md+.
 *
 * Each route file passes the form body as `children` and the
 * footer copy (e.g. "Already a rider? Login") as `footerNote`.
 */
export function RiderAuthLayout({
  children,
  footerNote,
  formHeader,
}: {
  children: React.ReactNode;
  /** Inline footer text + link, e.g. "Already a rider? Login". */
  footerNote: React.ReactNode;
  formHeader?: {
    title: string;
    subtitle: React.ReactNode;
  };
}) {
  const t = useT();
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white">
      <RiderHeroPanel />

      <div className="w-full md:w-[600px] md:shrink-0 flex-1 flex items-center justify-center bg-white px-6 py-12 md:px-16 md:py-20">
        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Brand badge — same brand-tile language as PartnerAuthLayout
              so the role visuals stay aligned, but the icon is the
              scooter glyph + the label reads "KhaiDai Rider".
              Wrapped in a Next.js Link to the customer homepage ("/")
              so the badge is clickable from any auth screen. */}
          <Link
            href="/"
            data-brand-link="home"
            aria-label={t("rider.auth.brandHomeAria")}
            className="flex items-center gap-[10px] cursor-pointer"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
              <RiderScooterIcon size={24} />
            </span>
            <span className="font-display text-[28px] font-extrabold text-ink leading-none">
              {t("rider.auth.brand")}
            </span>
          </Link>

          {formHeader ? (
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[28px] font-extrabold leading-[1.2] text-ink md:text-[32px]">
                {formHeader.title}
              </h1>
              <p className="text-[15px] font-normal text-ink-muted leading-[1.4]">
                {formHeader.subtitle}
              </p>
            </div>
          ) : null}

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
 * Left half — dark image with 75%-opacity overlay, brand badge
 * top-left, headline + supporting copy + stat bar bottom-left.
 *
 * Reuses the same `hero-bg.png` asset that PartnerAuthLayout uses
 * for visual consistency across the auth flow. The headline +
 * stat copy are rider-flavoured so each screen still reads as its
 * own role.
 */
function RiderHeroPanel() {
  const t = useT();
  return (
    <aside
      className="relative hidden md:flex md:w-[calc(100%-600px)] md:flex-1 items-start justify-start p-16 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/assets/hero-bg.png')" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[rgba(17,24,39,0.75)]" />

      <div className="relative z-10 flex flex-col h-full w-full">
        <Link
          href="/"
          data-brand-link="home"
          aria-label={t("rider.auth.brandHomeAria")}
          className="flex items-center gap-[10px] text-white cursor-pointer"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
            <RiderScooterIcon size={24} />
          </span>
          <span className="font-display text-[28px] font-extrabold leading-none">
            {t("rider.auth.brand")}
          </span>
        </Link>

        <div className="mt-auto flex max-w-[520px] flex-col gap-6 text-white">
          <h1 className="font-display font-extrabold leading-[1.2] text-[48px]">
            {t("rider.auth.heroTitle")}
          </h1>
          <p className="text-[18px] font-normal leading-[1.5] opacity-85">
            {t("rider.auth.heroSubtitle")}
          </p>
          <RiderStatBar />
        </div>
      </div>
    </aside>
  );
}

/** 3-stat strip rendered at the bottom of the hero panel. */
function RiderStatBar() {
  const t = useT();
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <RiderStat value={t("rider.auth.statEarningsValue")} label={t("rider.auth.statEarningsLabel")} />
      <RiderStat value={t("rider.auth.statRidersValue")} label={t("rider.auth.statRidersLabel")} />
      <RiderStat value={t("rider.auth.statSupportValue")} label={t("rider.auth.statSupportLabel")} />
    </div>
  );
}

function RiderStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-[28px] font-extrabold leading-none text-brand">
        {value}
      </span>
      <span className="text-[13px] font-normal leading-[1.3] text-white opacity-80">
        {label}
      </span>
    </div>
  );
}

/**
 * Inline link helper used in the footerNote slot. Renders a prompt +
 * a brand-coloured CTA link to the alternate route.
 */
export function RiderFooterLink({
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