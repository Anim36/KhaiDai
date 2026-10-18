"use client";

import { FlameIcon, PlusIcon } from "@/components/icons";
import { useCart } from "@/components/restaurants/cart/CartProvider";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import { resolveImageUrl } from "@/lib/imageUrl";
import type { Dish } from "@/data/home";
import type { MenuItem } from "@/data/restaurant-detail";
import { useT } from "@/lib/i18n/LocaleProvider";

const FALLBACK_DISH_IMAGE = "/assets/dish-1.png";

/**
 * Shared dish card used by the homepage's "Top Trending Dishes"
 * carousel AND the /dishes full grid. Two variants:
 *
 *   • "compact" — homepage carousel: 150px image, two-line
 *     name, single-line restaurant, price left + round "+"
 *     button right. The button shrinks to a 40×40 icon-only
 *     circle on mobile (and shows the "Add +" label ≥ sm) so a
 *     long Bangla dish name + price never crowds the touch target.
 *   • "full"    — /dishes grid: 180px image, 2-line description,
 *     popular badge, larger "Add +" button.
 *
 * Both variants share:
 *   • The exact same cart wiring (cart.add + setRestaurantName).
 *   • The same image-render path.
 *   • The same hover + tap feedback.
 *
 * The Dish → MenuItem translation happens here so the page-level
 * orchestrators can stay UI-only.
 */
export function DishCard({
  dish,
  variant = "compact",
}: {
  dish: Dish;
  variant?: "compact" | "full";
}) {
  const cart = useCart();
  const t = useT();
  const resolvedImage = resolveImageUrl(dish.image, FALLBACK_DISH_IMAGE) ?? FALLBACK_DISH_IMAGE;
  const menuItem: MenuItem = {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    price: dish.price,
    image: resolvedImage,
    popular: dish.popular,
    // Carried through so the cart knows which restaurant this item
    // belongs to — checkout's POST /api/orders payload relies on
    // `MenuItem.restaurantId` to set the order's restaurantId.
    restaurantId: dish.restaurantId,
  };

  const handleAdd = () => {
    // `tryAdd` returns either `added` (item merged into the cart)
    // or `conflict` (cart already holds items from a different
    // restaurant). The CartProvider's built-in modal handles the
    // confirmation flow — we don't need to do anything else here.
    cart.tryAdd(menuItem, dish.restaurant);
  };

  if (variant === "full") {
    return (
      <article
        data-dish-id={dish.id}
        data-dish-name={dish.name}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-shadow hover:shadow-md"
      >
        <div className="relative h-[180px] w-full overflow-hidden bg-surface">
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${resolvedImage}')` }}
          />
          {dish.popular ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand shadow-sm">
              <FlameIcon size={12} />
              Popular
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 font-display text-[18px] font-bold leading-tight text-ink">
            {dish.name}
          </h3>
          <p className="truncate text-[13px] font-normal text-ink-muted">
            {dish.restaurant}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] font-normal leading-relaxed text-ink-muted">
            {dish.description}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <span className="min-w-0 truncate font-display text-[18px] font-extrabold text-brand">
            {formatTaka(dish.price)}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            data-action="add-to-cart"
            data-dish-id={dish.id}
            aria-label={`${t("home.addToCart")} — ${dish.name}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity hover:opacity-90 sm:h-10 sm:w-auto sm:gap-1 sm:px-4 sm:rounded-pill"
          >
            <PlusIcon size={18} aria-hidden />
            <span className="hidden text-[13px] font-semibold sm:inline">
              {t("home.addToCart")}
            </span>
          </button>
        </div>
      </article>
    );
  }

  // compact — homepage carousel
  // Width rules:
  //   - mobile: w-[168px] (≈1 card + peek)
  //   - sm    : w-[180px]
  //   - xl    : w-[220px]  (4-up grid)
  // The card is `shrink-0` inside a `flex` carousel so each card
  // keeps its full width — without that, the default `min-w-0 flex-1`
  // collapses the card to ~75px and the name breaks across many lines.
  return (
    <article
      data-dish-id={dish.id}
      data-dish-name={dish.name}
      className="flex w-[168px] shrink-0 flex-col items-stretch overflow-hidden rounded-2xl border border-line bg-white sm:w-[180px] xl:w-[220px]"
    >
      <div
        aria-hidden
        className="h-[150px] w-full shrink-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${resolvedImage}')` }}
      />

      <div className="flex w-full min-w-0 flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 font-display text-[15px] font-bold leading-snug text-ink">
          {dish.name}
        </h3>
        <p className="truncate text-[12px] font-normal text-ink-muted">
          {dish.restaurant}
        </p>
      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-2 px-4 pb-4">
        <span className="min-w-0 truncate font-display text-[16px] font-extrabold text-brand">
          {formatTaka(dish.price)}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          data-action="add-to-cart"
          data-dish-id={dish.id}
          aria-label={`${t("home.addToCart")} — ${dish.name}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity hover:opacity-90 sm:h-10 sm:w-auto sm:gap-1 sm:px-4"
        >
          <PlusIcon size={18} aria-hidden />
          <span className="hidden text-[13px] font-semibold sm:inline">
            {t("home.addToCart")}
          </span>
        </button>
      </div>
    </article>
  );
}