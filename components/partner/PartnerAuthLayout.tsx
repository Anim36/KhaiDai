"use client";

import Link from "next/link";
import { PotIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Shared two-column shell used by /partner/login and /partner/register.
 *
 * Mirrors the Figma `partner-login` frame: dark food hero on the left
 * (brand badge + headline + supporting paragraph + stat bar), form panel
 * on the right (heading, optional tab pill, form, footer note).
 *
 * The form body is rendered by the parent page and passed in as
 * `children`, which keeps each route file responsible for its own
 * validation/UX while keeping the visual chrome consistent.
 */
export function PartnerAuthLayout({
  children,
  footerNote,
  formHeader,
  tabs,
}: {
  children: React.ReactNode;
  /** Short helper text rendered below the form (e.g. "Don't have an account? Register"). */
  footerNote: React.ReactNode;
  /** Optional heading + subtitle pair rendered above the form body.
   *  The subtitle is a node so each screen can mix plain text + inline
   *  links (e.g. "Already a partner? **Log in**"). */
  formHeader?: {
    title: string;
    subtitle: React.ReactNode;
  };
  /** Optional 2-tab pill switcher. Omit on the Login screen which has
   *  no tabs; the Register screen uses it to expose the Figma's two-step
   *  "Business Details / Upload Documents" flow. */
  tabs?: {
    items: Array<{ key: string; label: React.ReactNode; disabled?: boolean }>;
    activeKey: string;
    onSelect: (key: string) => void;
  };
}) {
  const t = useT();
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white">
      <PartnerHeroPanel />

      {/* Form panel — 600px fixed-width column per Figma spec. Vertical
          padding 80px / horizontal 64px on md+; below md the padding
          eases so the form remains legible on phones. */}
      <div className="w-full md:w-[600px] md:shrink-0 flex-1 flex items-center justify-center bg-white px-6 py-12 md:px-16 md:py-20">
        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Brand badge — Figma specifies a 24px white rounded-square
              with the pot icon, inside a 40×40 brand-coloured tile.
              Wrapped in a Next.js Link to the customer homepage ("/")
              so the badge is clickable from any auth screen. */}
          <Link
            href="/"
            data-brand-link="home"
            aria-label={t("partner.auth.brandAria")}
            className="flex items-center gap-[10px] cursor-pointer"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
              <PotIcon size={24} />
            </span>
            <span className="font-display text-[28px] font-extrabold text-ink leading-none">
              {t("partner.auth.brandLabel")}
            </span>
          </Link>

          {/* Heading block — Login keeps this minimal, Register uses the
              fuller "Join as a Restaurant Partner" + switch-link combo. */}
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

          {tabs ? <PartnerTabs {...tabs} /> : null}

          {children}

          {/* Footer line — each page passes its own copy ("Don't have an
              account? Register" vs "Already a partner? Log in"). */}
          <p className="text-center text-[14px] text-ink-muted mt-2">
            {footerNote}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Two-tab pill switcher (Figma `tabs` frame).
 *
 * The outer track is `bg-[#f9fafb]` 12px-radius, 4px inner padding.
 * The active tab is `bg-white` 10px-radius with brand-coloured 14px
 * ExtraBold label; inactive tabs are `#6b7280` 14px Medium. Tabs are
 * 24px horizontal / 12px vertical padding and flex-grow to fill the
 * track. The parent owns the active key — this component only renders
 * the visual state and forwards clicks, so the same switcher can drive
 * different form steps per route.
 */
function PartnerTabs({
  items,
  activeKey,
  onSelect,
}: NonNullable<PartnerAuthLayoutProps["tabs"]>) {
  return (
    <div className="flex w-full items-center rounded-xl bg-surface p-1">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => onSelect(item.key)}
            aria-pressed={active}
            className={
              "flex-1 rounded-[10px] px-6 py-3 text-center text-[14px] transition-colors " +
              (active
                ? "bg-white font-bold text-brand"
                : "font-medium text-ink-muted hover:text-ink")
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Left half — dark image with 75%-opacity overlay, KhaiDai badge
 * top-left, 48px ExtraBold headline + 16px supporting paragraph +
 * three accent-coloured stat numbers bottom-left.
 *
 * Reuses the existing `hero-bg.png` asset already in /public (sourced
 * from the customer-side homepage) so there's no extra CDN dependency.
 * When/if a partner-specific photo is added to the design system, swap
 * the `backgroundImage` URL here and everything keeps working.
 */
function PartnerHeroPanel() {
  const t = useT();
  return (
    <aside
      className="relative hidden md:flex md:w-[calc(100%-600px)] md:flex-1 items-start justify-start p-16 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/assets/hero-bg.png')" }}
      aria-hidden="true"
    >
      {/* Black 75%-opacity overlay — Figma spec `rgba(17,24,39,0.75)`. */}
      <div className="absolute inset-0 bg-[rgba(17,24,39,0.75)]" />

      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Brand row — mirrors the right-hand panel badge so the layout
            reads as one continuous chrome strip. Wrapped in a Next.js
            Link to the customer homepage ("/") so the badge is
            clickable from any auth screen. */}
        <Link
          href="/"
          data-brand-link="home"
          aria-label={t("partner.auth.brandAria")}
          className="flex items-center gap-[10px] text-white cursor-pointer"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
            <PotIcon size={24} />
          </span>
          <span className="font-display text-[28px] font-extrabold leading-none">
            {t("partner.auth.brandLabel")}
          </span>
        </Link>

        {/* Bottom-anchored headline + supporting copy + stat bar.
            Figma spec: 24px gap between blocks. `mt-auto` pins the
            cluster to the bottom regardless of viewport height. */}
        <div className="mt-auto flex max-w-[520px] flex-col gap-6 text-white">
          <h1 className="font-display font-extrabold leading-[1.2] text-[48px]">
            {t("partner.auth.heroTitle")}
          </h1>
          <p className="text-[18px] font-normal leading-[1.5] opacity-85">
            {t("partner.auth.heroSubtitle")}
          </p>
          <PartnerStatBar />
        </div>
      </div>
    </aside>
  );
}

/**
 * 3-stat strip rendered at the bottom of the hero panel.
 * Figma: gap 32px between stats; each stat = 4px vertical gap between
 * the brand-coloured 28px ExtraBold number and the 13px 80%-opacity
 * white caption.
 */
function PartnerStatBar() {
  const t = useT();
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <PartnerStat value="30M+" label={t("partner.auth.stats.monthlyOrders")} />
      <PartnerStat value="1,200+" label={t("partner.auth.stats.partners")} />
      <PartnerStat value="25 min" label={t("partner.auth.stats.deliveryTime")} />
    </div>
  );
}

function PartnerStat({ value, label }: { value: string; label: string }) {
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
 * Inline link helper — used for the "Don't have an account?" line on
 * the login page and its mirror on the register page.
 */
export function PartnerFooterLink({
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

// Local helper so `PartnerTabs` can refer to the layout's prop type
// without re-importing the surrounding component signature.
type PartnerAuthLayoutProps = Parameters<typeof PartnerAuthLayout>[0];
