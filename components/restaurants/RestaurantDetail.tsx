"use client";

import { useEffect, useState } from "react";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { useCart } from "./cart/CartProvider";
import { CoverBanner } from "./CoverBanner";
import { CategoryTabs } from "./CategoryTabs";
import { MenuItemCard } from "./MenuItemCard";
import { CartPanel } from "./CartPanel";
import { RestaurantReviewsList } from "@/components/restaurants/RestaurantReviewsList";
import {
  RestaurantPromoChips,
  type RestaurantPromo,
} from "@/components/restaurants/RestaurantPromoChips";
import type { RestaurantDetail as RestaurantDetailType } from "@/data/restaurant-detail";
import { useT } from "@/lib/i18n/LocaleProvider";

type Props = {
  data: RestaurantDetailType;
  /** কাজ ৪ — partner-scoped active promo codes for the chip row. */
  promoCodes?: RestaurantPromo[];
};

/**
 * Client orchestrator for the restaurant-detail page.
 *
 * - Pushes the active restaurant name into the app-wide cart context so
 *   the cart panel + checkout page always know which restaurant the items
 *   belong to.
 * - Owns the currently-active category (sticky tabs).
 * - Lays out the two-column split (menu | cart) per Figma.
 */
export function RestaurantDetail({ data, promoCodes }: Props) {
  const t = useT();
  const [activeCategory, setActiveCategory] = useState<string>(
    data.menu[0]?.id ?? ""
  );
  const { setRestaurantName } = useCart();

  // Keep the cart panel's "Restaurant" header in sync with the page the
  // user is currently browsing.
  useEffect(() => {
    setRestaurantName(data.name);
  }, [data.name, setRestaurantName]);

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-surface-page">
        <CoverBanner
          cover={data.cover}
          name={data.name}
          cuisine={data.cuisine}
          notice={data.notice}
          restaurantId={data.id}
          rating={data.rating}
          reviewsCount={data.reviews}
        />

        {/* Inner spacer pushes content below the navbar (h-[80px]).
            Mobile gets extra bottom padding so the sticky cart bar
            (rendered inside CartPanel) doesn't cover the last menu
            item; desktop doesn't need it because the cart is in
            the right column. */}
        <section className="mx-auto flex w-full max-w-page flex-col gap-8 px-6 pb-32 pt-10 md:flex-row md:gap-6 md:px-[64px] md:pb-16 md:pt-16">
          {/* Left: menu list with sticky category tabs */}
          <div className="flex flex-1 flex-col gap-8 min-w-px">
            {/* কাজ ২ — partner flipped the toggle off. Tell the
                customer the restaurant is closed before they scroll
                the menu; the Add buttons below are also disabled via
                the `acceptingOrders` flag we pass to MenuItemCard. */}
            {data.isAcceptingOrders === false ? (
              <div
                role="status"
                data-restaurant-closed="true"
                className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800"
              >
                <span aria-hidden className="text-[16px]">⏸</span>
                <span>
                  {t("restaurantDetail.currentlyClosed")}
                </span>
              </div>
            ) : null}

            {/* কাজ ৪ — partner's active promo codes, as a Foodpanda-style
                chip row + modal. Renders nothing when no active codes
                exist so the layout doesn't pick up a stray gap. */}
            {promoCodes && promoCodes.length > 0 ? (
              <RestaurantPromoChips promos={promoCodes} />
            ) : null}
            <CategoryTabs
              categories={data.menu}
              activeId={activeCategory}
              onSelect={setActiveCategory}
            />

            {data.menu.map((cat) => (
              <section
                key={cat.id}
                id={`category-${cat.id}`}
                className="flex flex-col gap-5 scroll-mt-28"
              >
                <h3 className="w-full font-display text-[24px] font-extrabold leading-none text-ink">
                  {cat.name}
                </h3>
                <div className="flex w-full flex-col gap-5">
                  {cat.items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      restaurantName={data.name}
                      acceptingOrders={data.isAcceptingOrders !== false}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Right: sticky cart */}
          <CartPanel />
        </section>

        {/* Reviews — full-width row below the two-column split so
            it doesn't squeeze the menu on narrow viewports. The
            list self-hydrates from /api/restaurants/[id]/reviews. */}
        <section className="mx-auto w-full max-w-page px-6 pb-16 md:px-[64px]">
          <RestaurantReviewsList restaurantId={data.id} />
        </section>
      </main>
      <Footer />
    </>
  );
}
