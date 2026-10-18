"use client";

import Image from "next/image";
import { CheckIcon } from "@/components/icons";
import { type PaymentMethodId, paymentMethods } from "@/data/checkout";
import { useT } from "@/lib/i18n/LocaleProvider";

type Props = {
  selected: PaymentMethodId;
  onSelect: (id: PaymentMethodId) => void;
};

/**
 * "Choose Payment Method" card (third card in the checkout left pane).
 *
 * Job 1 (কাজ ১) — after the simplification, only two options:
 *   • "Online Payment" — generic icon + a small horizontal strip of
 *     brand badges (BKash / Nagad / Rocket / Visa) so the customer
 *     understands the gateway will accept any of them. Click
 *     selects ONE radio (`online`). The actual wallet choice
 *     happens inside SSLCommerz's own page after Place Order.
 *   • "Cash on Delivery" — unchanged.
 *
 * Visual rules:
 *   • Active option: brand-100 background + brand border + filled
 *     brand radio with white check icon.
 *   • Inactive option: page background + line border + empty line
 *     radio.
 *   • Brand PNGs render at 24×24 in a horizontal strip via next/image
 *     so they get responsive sizing. CSS `loading="lazy"` is the
 *     default for next/image so the row doesn't block.
 */
export function PaymentSection({ selected, onSelect }: Props) {
  const t = useT();
  return (
    <section className="w-full rounded-card border border-line bg-white p-7">
      <h2 className="font-display text-[20px] font-extrabold leading-none text-ink">
        {t("paymentSection.title")}
      </h2>

      <div role="radiogroup" className="mt-5 flex w-full flex-col gap-3">
        {paymentMethods.map(({ id, label, sublabel, Icon, brandBadges, badgeAlt }) => {
          const active = id === selected;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              data-payment-id={id}
              onClick={() => onSelect(id)}
              className={[
                "flex w-full items-start justify-between gap-4 rounded-xl border px-4 py-4 text-left transition-colors",
                active
                  ? "border-brand bg-brand-100"
                  : "border-line bg-surface-page hover:border-brand/40",
              ].join(" ")}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-white text-brand" : "bg-white text-ink",
                  ].join(" ")}
                >
                  {Icon ? <Icon size={20} /> : null}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="whitespace-nowrap font-display text-[15px] font-bold leading-none text-ink">
                    {label}
                  </p>
                  {sublabel ? (
                    <p className="text-[12px] leading-snug text-ink-muted">
                      {sublabel}
                    </p>
                  ) : null}
                  {brandBadges && brandBadges.length > 0 ? (
                    <ul
                      className="mt-1 flex items-center gap-2"
                      aria-label={badgeAlt}
                    >
                      {brandBadges.map((src) => (
                        <li
                          key={src}
                          className="relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-line"
                        >
                          <Image
                            src={src}
                            alt=""
                            fill
                            sizes="24px"
                            className="object-cover"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <span
                className={[
                  "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-[10px] border-2",
                  active
                    ? "border-brand bg-brand"
                    : "border-line bg-transparent",
                ].join(" ")}
              >
                {active && <CheckIcon size={10} className="text-white" />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}