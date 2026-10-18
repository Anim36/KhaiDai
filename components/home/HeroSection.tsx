"use client";

import { ArrowRightIcon, MapPinHeroIcon } from "@/components/icons";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";
import { useT } from "@/lib/i18n/LocaleProvider";

export function HeroSection() {
  const { address, openPicker } = useDeliveryAddress();
  const t = useT();

  const placeholder = t("home.addressPlaceholder");
  const displayAddress = address?.fullAddress ?? placeholder;

  return (
    <section
      className="relative flex h-[520px] w-full items-center bg-cover bg-center"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,.65)), url('/assets/hero-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="mx-auto flex w-full max-w-page items-center gap-16 px-4 md:px-[64px]">
        {/* Left */}
        {/* `min-w-0` is the canonical fix for a flex-1 child whose
            text content would otherwise force the flex container
            past the viewport — without it, a long h1 forces the
            column to be 600px+ wide. */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <h1 className="font-display text-[28px] font-extrabold leading-[1.1] text-white sm:text-[36px] md:text-[56px]">
            {t("home.heroTitle")} {" "}
            <span className="text-brand">{t("home.heroSubtitle")}</span>
          </h1>
          <p className="max-w-[520px] text-[16px] font-normal text-[#e5e7eb] md:text-[20px]">
            {t("home.heroTagline")}
          </p>

          {/* Address pill */}
          <button
            type="button"
            onClick={() => openPicker()}
            aria-label={t("home.addressAria")}
            // `min-w-0` on the flex-1 child is the canonical fix for
            // long text overflowing a flex parent's boundary — without
            // it, the inner span can't shrink past its intrinsic width
            // and bleeds over the Order Now button. We also pin the
            // CTA with `shrink-0` so it always keeps its full width.
            className="group mt-2 flex h-[60px] w-full max-w-[560px] min-w-0 items-center gap-2 rounded-[36px] bg-white p-2 text-left shadow-lg transition hover:shadow-xl sm:w-[560px]"
          >
            <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-4">
              <MapPinHeroIcon
                size={20}
                className="shrink-0 text-brand"
              />
              <span
                title={address?.fullAddress ?? placeholder}
                className={
                  "block min-w-0 truncate bg-transparent text-[15px] font-normal " +
                  (address ? "text-ink" : "text-ink-muted")
                }
              >
                {displayAddress}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full bg-brand px-6 py-3 text-[14px] font-bold text-white transition group-hover:opacity-90">
              <span>{t("home.heroSubtitle")}</span>
              <ArrowRightIcon size={18} className="text-white" />
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}