"use client";

import { useEffect, useMemo, useState } from "react";
import { DishCard } from "@/components/home/DishCard";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";
import { dishCategories, type Dish } from "@/data/home";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * /dishes — full grid of every trending dish, with category
 * + price-range filter chips. Same design system as the homepage:
 *   • TopNav — sticky navbar with the live cart count.
 *   • Page header — title + 1-line subtitle + count of dishes shown.
 *   • Filter strip — "All" + one chip per category + a price-range
 *     sort.
 *   • Responsive grid — 1 col on mobile, 2 on md, 3 on lg, 4 on xl.
 *   • Footer — same dark footer as the homepage.
 *
 * Cart wiring: each DishCard calls `cart.add(MenuItem)` +
 * `cart.setRestaurantName(dish.restaurant)` so adding from here
 * bumps the navbar's `Cart (N)` badge live — same CartContext
 * the homepage carousel uses.
 *
 * Data source: `GET /api/dishes/trending` — same leaderboard the
 * homepage carousel renders. Falls back to recent menu items when
 * no DELIVERED orders exist yet.
 */
export function DishesPage() {
  const t = useT();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [priceRange, setPriceRange] = useState<"all" | "lt200" | "lt300">(
    "all",
  );
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  // Re-run the leaderboard fetch whenever the customer's selected
  // address pin changes — same 5 km radius as the listing endpoint.
  // Guests / first-paint (no address yet) see the un-filtered list.
  const { address } = useDeliveryAddress();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Pull the larger batch (limit=50) so the grid can show up
        // to 50 items even when the database is fresh.
        const params = new URLSearchParams();
        params.set("limit", "50");
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
        // Leave `dishes` as null; the loading skeleton below takes
        // over until the next refresh.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [address?.latitude, address?.longitude]);

  // Categories are derived from the live dataset so the filter
  // chips stay in sync with whatever the API returns.
  const categories = useMemo(() => {
    const present = new Set<string>();
    (dishes ?? []).forEach((d) => present.add(d.category));
    return Array.from(present).sort((a, b) => a.localeCompare(b));
  }, [dishes]);

  const filtered = useMemo(() => {
    if (!dishes) return [];
    return dishes.filter((d: Dish) => {
      if (activeCategory !== "All" && d.category !== activeCategory) {
        return false;
      }
      if (priceRange === "lt200" && d.price >= 200) return false;
      if (priceRange === "lt300" && d.price >= 300) return false;
      return true;
    });
  }, [dishes, activeCategory, priceRange]);

  // Use the derived `categories` set when we have data, otherwise
  // fall back to the static list so the chips don't pop in/out.
  const visibleCategories = dishes ? categories : dishCategories;

  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-4 pb-12 pt-6 sm:px-6 sm:pb-16 sm:pt-8 lg:px-[64px] lg:pb-20 lg:pt-10">
        {/* Page header */}
        <header className="flex flex-col gap-2 pb-8">
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[40px]">
            {t("dishesPage.title")}
          </h1>
          <p className="text-[15px] font-normal text-ink-muted">
            {t("dishesPage.subtitle", {
              shown: filtered.length,
              total: dishes?.length ?? 0,
            })}
          </p>
        </header>

        {/* Filter chips — category + price */}
        <div className="flex flex-col gap-4 pb-8">
          {/* Category strip */}
          <div
            role="tablist"
            aria-label={t("dishesPage.filterByCategory")}
            className="flex flex-wrap gap-2"
          >
            <FilterChip
              label={t("dishesPage.filterAll")}
              active={activeCategory === "All"}
              onClick={() => setActiveCategory("All")}
            />
            {visibleCategories.map((cat) => (
              <FilterChip
                key={cat}
                label={cat}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
              />
            ))}
          </div>

          {/* Price strip */}
          <div
            role="tablist"
            aria-label={t("dishesPage.filterByPrice")}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
              {t("dishesPage.priceLabel")}
            </span>
            <FilterChip
              label={t("dishesPage.filterAny")}
              active={priceRange === "all"}
              onClick={() => setPriceRange("all")}
            />
            <FilterChip
              label={t("dishesPage.filterUnder200")}
              active={priceRange === "lt200"}
              onClick={() => setPriceRange("lt200")}
            />
            <FilterChip
              label={t("dishesPage.filterUnder300")}
              active={priceRange === "lt300"}
              onClick={() => setPriceRange("lt300")}
            />
          </div>
        </div>

        {/* Grid */}
        {dishes === null ? (
          // Loading skeleton: 8 placeholder cards so the grid has
          // a stable shape while the leaderboard fetch resolves.
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <DishesSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((d) => (
              <DishCard key={d.id} dish={d} variant="full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <span className="font-display text-[16px] font-extrabold text-ink">
              {t("dishesPage.emptyTitle")}
            </span>
            <p className="text-[13px] text-ink-muted">
              {t("dishesPage.emptyHint")}
            </p>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}

/**
 * Full-card skeleton used by /dishes while the leaderboard fetch
 * resolves. Matches the `full` DishCard footprint so the grid
 * doesn't reflow when real data lands.
 */
function DishesSkeleton() {
  return (
    <div
      aria-hidden
      className="flex w-full flex-col gap-3 rounded-card bg-white"
    >
      <div className="h-[180px] w-full animate-pulse rounded-2xl bg-surface" />
      <div className="flex flex-col gap-2 px-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-surface" />
        <div className="mt-2 flex items-center justify-between">
          <div className="h-5 w-16 animate-pulse rounded bg-surface" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-surface" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Filter chip                                                               */
/* -------------------------------------------------------------------------- */

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-filter-chip={label}
      className={
        "shrink-0 rounded-pill px-4 py-2 text-[12px] font-semibold transition-colors " +
        (active
          ? "bg-brand text-white"
          : "bg-surface text-ink-muted hover:bg-line hover:text-ink")
      }
    >
      {label}
    </button>
  );
}
