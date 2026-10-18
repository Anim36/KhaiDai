"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { DishCard } from "@/components/home/DishCard";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";
import type { Dish } from "@/data/home";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * "Top Trending Dishes" section on the homepage.
 *
 *   • Fetches the live leaderboard from `GET /api/dishes/trending`.
 *     The endpoint aggregates OrderItem.quantity across DELIVERED
 *     orders so the section reflects what real customers have
 *     actually been ordering. When no DELIVERED orders exist yet
 *     (fresh database) the API falls back to the most recently
 *     added menu items so the section is never blank.
 *   • Renders the first 4 dishes in the compact `DishCard`
 *     variant (image 150px, no description, smaller Add + button).
 *   • The header's "See All" link points at /dishes — the full
 *     grid page lives in `app/dishes/page.tsx`.
 *
 * Loading / error states:
 *   • While the request is in flight we render 4 skeleton cards so
 *     the layout doesn't jump when real data lands.
 *   • If the request fails the section renders nothing rather than
 *     a half-broken UI.
 *
 * Cart wiring: the `DishCard` calls `cart.add(MenuItem)` +
 * `cart.setRestaurantName(dish.restaurant)` — same CartContext
 * the /restaurants/[id] menu uses, so adding a dish bumps the
 * navbar's `Cart (N)` badge live.
 */
export function TopTrendingDishes() {
  // Re-run the fetch when the customer's selected address pin
  // changes — the API uses the same 5 km radius as the listing
  // endpoint, so a different pin returns a different leaderboard.
  // Guests / first-paint (no address yet) see the un-filtered list.
  const { address } = useDeliveryAddress();
  const t = useT();
  const [dishes, setDishes] = useState<Dish[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        params.set("limit", "12");
        if (address) {
          params.set("lat", String(address.latitude));
          params.set("lng", String(address.longitude));
        }
        const res = await fetch(`/api/dishes/trending?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { dishes?: Dish[] };
        if (!cancelled && Array.isArray(body.dishes)) {
          setDishes(body.dishes);
        }
      } catch {
        // Network failure — leave dishes as null; the section stays
        // hidden so the homepage never shows a partial / broken
        // trending list.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address?.latitude, address?.longitude]);

  // Show 4 cards on the homepage carousel; the full 12-item grid
  // lives on /dishes.
  const featured = dishes?.slice(0, 4) ?? [];

  return (
    <section className="flex w-full flex-col items-start gap-6 px-4 pb-12 pt-5 sm:px-6 sm:pb-16 lg:px-[64px] lg:pb-20">
      <div className="flex w-full items-center justify-between">
        <h2 className="font-display text-[22px] font-extrabold text-ink sm:text-[28px]">
          {t("home.trendingTitle")}
        </h2>
        <Link
          href="/dishes"
          data-action="see-all-dishes"
          className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand hover:underline"
        >
          {t("home.seeAll")}
          <ArrowRightIcon size={16} />
        </Link>
      </div>

      <div className="-mx-4 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-hide px-4 sm:gap-4 xl:mx-0 xl:w-full xl:gap-6 xl:overflow-visible xl:px-0">
        {dishes === null ? (
          // Skeleton: 4 placeholder cards so the layout is stable
          // while the real fetch resolves.
          Array.from({ length: 4 }).map((_, i) => (
            <TrendingSkeleton key={i} />
          ))
        ) : featured.length === 0 ? (
          // Empty state — surfaced when the API returned an empty
          // list (no trending dishes and no fallback menu items).
          // Tells visitors what to do next instead of leaving a
          // dead section.
          <div className="flex w-full items-center justify-between rounded-2xl border border-dashed border-line bg-surface px-6 py-8">
            <div className="flex flex-col gap-1">
              <span className="font-display text-[16px] font-extrabold text-ink">
                {t("home.trendingEmpty")}
              </span>
              <p className="text-[13px] text-ink-muted">
                {t("home.trendingEmptyHint")}
              </p>
            </div>
            <Link
              href="/restaurants"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            >
              {t("home.browseRestaurants")}
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        ) : (
          featured.map((d) => <DishCard key={d.id} dish={d} variant="compact" />)
        )}
      </div>
    </section>
  );
}

/**
 * Compact-card skeleton used while the trending list is loading.
 * Matches the compact `DishCard` footprint (240×260) so the
 * homepage doesn't reflow when the real data arrives.
 */
function TrendingSkeleton() {
  return (
    <div
      aria-hidden
      className="flex w-[240px] shrink-0 flex-col gap-3 rounded-card bg-white"
    >
      <div className="h-[150px] w-full animate-pulse rounded-2xl bg-surface" />
      <div className="flex flex-col gap-2 px-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface" />
        <div className="mt-2 flex items-center justify-between">
          <div className="h-5 w-16 animate-pulse rounded bg-surface" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-surface" />
        </div>
      </div>
    </div>
  );
}
