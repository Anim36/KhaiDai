"use client";

import Link from "next/link";
import {
  AppleIcon,
  FacebookIcon,
  GooglePlayBadgeIcon,
  InstagramIcon,
  PotIcon,
  RiderScooterIcon,
  TwitterIcon,
  YoutubeIcon,
} from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

export function Footer() {
  const t = useT();
  return (
    <footer className="w-full bg-ink">
      <div className="mx-auto w-full max-w-page px-4 py-12 sm:px-6 sm:py-16 lg:px-[64px] lg:py-20">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 md:grid-cols-5">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
                <PotIcon size={24} />
              </span>
              <span className="font-display text-2xl font-extrabold text-white">
                KhaiDai
              </span>
            </div>
            <p className="max-w-[280px] text-[14px] leading-relaxed text-white/60">
              {t("home.heroTagline")}
            </p>
            <div className="mt-2 flex items-center gap-3 text-white/80">
              <a href="#" aria-label="Facebook" className="hover:text-white">
                <FacebookIcon size={18} />
              </a>
              <a href="#" aria-label="Instagram" className="hover:text-white">
                <InstagramIcon size={18} />
              </a>
              <a href="#" aria-label="Twitter" className="hover:text-white">
                <TwitterIcon size={18} />
              </a>
              <a href="#" aria-label="YouTube" className="hover:text-white">
                <YoutubeIcon size={18} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col gap-3">
            <h4 className="font-display text-[14px] font-bold uppercase tracking-wide text-white">
              {t("footer.quickLinks")}
            </h4>
            <ul className="flex flex-col gap-2 text-[14px] text-white/70">
              <li>
                <Link
                  href="/"
                  data-footer-link="home"
                  className="hover:text-white"
                >
                  {t("nav.home")}
                </Link>
              </li>
              <li>
                <Link
                  href="/restaurants"
                  data-footer-link="restaurants"
                  className="hover:text-white"
                >
                  {t("nav.restaurants")}
                </Link>
              </li>
              <li>
                <Link
                  href="/dishes"
                  data-footer-link="dishes"
                  className="hover:text-white"
                >
                  {t("home.trendingTitle")}
                </Link>
              </li>
              <li>
                <Link
                  href="/offers"
                  data-footer-link="offers"
                  className="hover:text-white"
                >
                  {t("nav.offers")}
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  data-footer-link="about"
                  className="hover:text-white"
                >
                  {t("footer.aboutUs")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="flex flex-col gap-3">
            <h4 className="font-display text-[14px] font-bold uppercase tracking-wide text-white">
              {t("footer.support")}
            </h4>
            <ul className="flex flex-col gap-2 text-[14px] text-white/70">
              <li>
                <Link
                  href="/help"
                  data-footer-link="help"
                  className="hover:text-white"
                >
                  {t("footer.helpCenter")}
                </Link>
              </li>
              <li>
                <Link
                  href="/safety"
                  data-footer-link="safety"
                  className="hover:text-white"
                >
                  {t("footer.safety")}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  data-footer-link="terms"
                  className="hover:text-white"
                >
                  {t("footer.terms")}
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  data-footer-link="privacy"
                  className="hover:text-white"
                >
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  data-footer-link="contact"
                  className="hover:text-white"
                >
                  {t("footer.contact")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Work with us */}
          <div className="flex flex-col gap-3">
            <h4 className="font-display text-[14px] font-bold uppercase tracking-wide text-white">
              {t("footer.workWithUs")}
            </h4>
            <ul className="flex flex-col gap-2 text-[14px] text-white/70">
              <li>
                <Link
                  href="/partner/login"
                  data-footer-link="partner-login"
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <PotIcon size={16} />
                  {t("footer.becomePartner")}
                </Link>
              </li>
              <li>
                <Link
                  href="/rider/login"
                  data-footer-link="rider-login"
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <RiderScooterIcon size={16} />
                  {t("footer.becomeRider")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Download */}
          <div className="flex flex-col gap-3">
            <h4 className="font-display text-[14px] font-bold uppercase tracking-wide text-white">
              {t("footer.getTheApp")}
            </h4>
            <p className="text-[13px] text-white/60">
              {t("footer.getTheAppSubtitle")}
            </p>
            <div className="mt-2 flex flex-col gap-3">
              <a
                href="#"
                className="flex h-12 items-center gap-3 rounded-[12px] bg-white/10 px-4 text-white hover:bg-white/15"
              >
                <AppleIcon size={22} />
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] uppercase tracking-wide">
                    {t("footer.downloadOnThe")}
                  </span>
                  <span className="font-display text-[14px] font-bold">
                    {t("footer.appStore")}
                  </span>
                </span>
              </a>
              <a
                href="#"
                className="flex h-12 items-center gap-3 rounded-[12px] bg-white/10 px-4 text-white hover:bg-white/15"
              >
                <GooglePlayBadgeIcon size={22} />
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] uppercase tracking-wide">
                    {t("footer.getItOn")}
                  </span>
                  <span className="font-display text-[14px] font-bold">
                    {t("footer.googlePlay")}
                  </span>
                </span>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 h-px w-full bg-white/10" />

        <div className="mt-6 flex flex-col items-center justify-between gap-2 text-[13px] text-white/50 md:flex-row">
          <span>© 2026 KhaiDai. {t("footer.rights")}.</span>
          <span>{t("footer.crafted")}.</span>
        </div>
      </div>
    </footer>
  );
}