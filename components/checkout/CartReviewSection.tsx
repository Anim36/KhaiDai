"use client";

import { MinusIcon, PlusIcon } from "@/components/icons";
import { formatTaka, useCart } from "@/components/restaurants/cart/CartProvider";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * "Review Cart Items" card (first card in the checkout left pane).
 *
 * - white card, 1px line border, 20px radius, 28px padding
 * - title (Outfit ExtraBold 20px) + per-line rows separated by 16px
 * - each row: left column name (Outfit Bold 16px) + subtitle "qty × ৳price"
 *   (Geist 13px muted), right column line total (Outfit Bold 16px)
 * - when qty is 0 the row is removed by the cart context; here we keep
 *   the +/- / remove controls so the user can adjust the line.
 */
export function CartReviewSection() {
  const cart = useCart();
  const t = useT();

  if (cart.lines.length === 0) {
    return (
      <section className="w-full rounded-card border border-line bg-white p-7">
        <h2 className="font-display text-[20px] font-extrabold leading-none text-ink">
          {t("cartReviewSection.title")}
        </h2>
        <p className="mt-3 text-[14px] font-medium text-ink-muted">
          {t("cartReviewSection.empty")}
        </p>
      </section>
    );
  }

  return (
    <section className="w-full rounded-card border border-line bg-white p-7">
      <h2 className="font-display text-[20px] font-extrabold leading-none text-ink">
        {t("cartReviewSection.title")}
      </h2>

      <ul className="mt-5 flex w-full flex-col gap-4">
        {cart.lines.map((line) => (
          <li
            key={line.item.id}
            className="flex w-full items-center justify-between gap-4"
          >
            <div className="flex w-[380px] flex-col gap-0.5">
              <p className="w-full font-display text-[16px] font-bold leading-none text-ink">
                {line.item.name}
              </p>
              <p className="text-[13px] font-normal leading-none text-ink-muted">
                {line.quantity} x {formatTaka(line.item.price)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-surface-page px-2 py-1">
                <button
                  type="button"
                  aria-label={`Decrease ${line.item.name}`}
                  onClick={() => cart.decrement(line.item.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-ink hover:bg-brand-50"
                >
                  <MinusIcon size={14} />
                </button>
                <span className="min-w-[18px] text-center font-display text-[14px] font-bold text-ink">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${line.item.name}`}
                  onClick={() => cart.increment(line.item.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-white hover:bg-brand/90"
                >
                  <PlusIcon size={14} />
                </button>
              </div>
              <p className="whitespace-nowrap font-display text-[16px] font-bold leading-none text-ink">
                {formatTaka(line.item.price * line.quantity)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
