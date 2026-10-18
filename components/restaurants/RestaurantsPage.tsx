"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import {
  cuisineOptions,
  deliveryOptions,
  type CuisineId,
  type Restaurant,
} from "@/data/restaurants";
import { ListingHeader, type SortKey } from "./ListingHeader";
import { RestaurantCard } from "./RestaurantCard";
import { Sidebar, type FilterState } from "./Sidebar";
import { CloseIcon, SlidersIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Map known category labels (from `data/home.ts`) to filterable cuisine ids.
 * For example, clicking "Biryani" should pre-select the "Bengali" cuisine
 * chip on /restaurants (Biryani is overwhelmingly Bengali) AND seed the
 * search so any restaurant whose menu is tagged "Biryani" also matches.
 */
const CATEGORY_TO_CUISINE: Record<string, CuisineId> = {
  "Biryani": "Bengali",
  "Burgers & Pizza": "Burgers",
  "Chinese & Thai": "Chinese",
  "Sweets & Desserts": "Desserts",
  "Snacks": "Indian",
  "Healthy Foods": "Healthy",
};

function matchesRating(r: Restaurant, ratings: FilterState["ratings"]) {
  if (ratings.size === 0) return true;
  return Array.from(ratings).some((opt) => {
    const threshold = parseFloat(opt);
    return r.rating >= threshold;
  });
}

function matchesDelivery(r: Restaurant, delivery: FilterState["delivery"]) {
  if (delivery.size === 0) return true;
  // Use the upper bound of the time range as the indicator.
  return Array.from(delivery).some((id) => {
    const opt = deliveryOptions.find((o) => o.id === id);
    return opt ? r.timeMax <= opt.max : false;
  });
}

function matchesPrice(r: Restaurant, prices: FilterState["prices"]) {
  if (prices.size === 0) return true;
  return prices.has(r.priceBucket);
}

function matchesOffers(r: Restaurant, offers: FilterState["offers"]) {
  if (offers.size === 0) return true;
  if (offers.has("Free Delivery")) return r.freeDelivery;
  // The other two offers are treated as cosmetic filters – we treat any
  // restaurant with a `promo` field as having a deal.
  return Boolean(r.promo);
}

function matchesCuisine(r: Restaurant, cuisines: FilterState["cuisines"]) {
  if (cuisines.size === 0) return true;
  // Match on cuisine string OR on any of the restaurant's menu
  // categories. The homepage "What's on your mind?" strip maps
  // each label to a cuisineId, but we want restaurants whose menu
  // is tagged with that category (e.g. menu has "Biryani" items but
  // cuisine is "Indian") to surface too.
  return Array.from(cuisines).some((c) => {
    const needle = c.toLowerCase();
    if (r.cuisine.toLowerCase().includes(needle)) return true;
    if (r.menuCategories && r.menuCategories.some((m) => m.toLowerCase().includes(needle))) {
      return true;
    }
    return false;
  });
}

function matchesQuery(r: Restaurant, q: string) {
  if (!q.trim()) return true;
  const needle = q.toLowerCase();
  return (
    r.name.toLowerCase().includes(needle) ||
    r.cuisine.toLowerCase().includes(needle)
  );
}

const emptyFilters = (): FilterState => ({
  cuisines: new Set(),
  ratings: new Set(),
  prices: new Set(),
  delivery: new Set(),
  offers: new Set(),
  query: "",
});

/**
 * Pulls initial filter state from URL query params:
 *   ?q=<text>           → search text
 *   ?cuisine=<id,…>     → cuisine checkboxes
 *   ?category=<label>   → mapped via CATEGORY_TO_CUISINE
 */
function initialFiltersFromSearchParams(
  params: URLSearchParams | null
): FilterState {
  const f = emptyFilters();
  if (!params) return f;

  const q = params.get("q");
  if (q) f.query = q;

  const cuisineParam = params.get("cuisine");
  if (cuisineParam) {
    for (const c of cuisineParam.split(",")) {
      if ((cuisineOptions as readonly string[]).includes(c)) {
        f.cuisines.add(c as CuisineId);
      }
    }
  }

  const category = params.get("category");
  if (category && CATEGORY_TO_CUISINE[category]) {
    f.cuisines.add(CATEGORY_TO_CUISINE[category]);
  }

  return f;
}

function RestaurantsPageInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() =>
    initialFiltersFromSearchParams(searchParams),
  );
  // Surface the homepage category label ("Biryani", "Burgers & Pizza",
  // …) selected via `?category=`. The cuisine checkboxes get the
  // matching id via CATEGORY_TO_CUISINE, but the user-visible chip
  // shows the original label so the user remembers where the filter
  // came from.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    () => searchParams?.get("category") ?? null,
  );
  const [sort, setSort] = useState<SortKey>("relevance");
  // Mobile filter drawer — the sidebar moves into a slide-up
  // bottom-sheet on < lg viewports so the 260px fixed-width
  // panel doesn't crush the restaurant grid.
  const [filterOpen, setFilterOpen] = useState(false);

  // Customer's picked delivery address. When it changes we re-fetch
  // the listing so the backend can re-rank by distance from the new
  // pin and apply the 5 km radius filter.
  const { address } = useDeliveryAddress();

  // Restaurant list fetched from /api/restaurants; filters + sort
  // run client-side over the returned list so changing a chip doesn't
  // hit the network. But the distance filter *does* live on the
  // server, so we refetch whenever the address pin moves.
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; items: Restaurant[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState((prev) =>
        prev.kind === "ready" ? { kind: "loading" } : prev,
      );
      // Build the query string from the customer's address pin. We
      // always re-issue the request when the address changes so the
      // server can apply its 5 km radius filter and reorder the
      // list by distance.
      const qs = new URLSearchParams();
      if (address) {
        qs.set("lat", String(address.latitude));
        qs.set("lng", String(address.longitude));
      }
      const path =
        qs.toString().length > 0
          ? `/api/restaurants?${qs.toString()}`
          : "/api/restaurants";

      const res = await apiFetch<{ restaurants: Restaurant[] }>(path);
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "error", message: res.error.message });
        return;
      }
      setState({ kind: "ready", items: res.data?.restaurants ?? [] });
    }
    load().catch((err) => {
      if (cancelled) return;
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load restaurants",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // If the URL changes (e.g. user clicks a different category on the homepage),
  // re-seed the filter state and remember the category label so we can
  // render it as a dismissible banner chip above the listings.
  useEffect(() => {
    setFilters(initialFiltersFromSearchParams(searchParams));
    setSelectedCategory(searchParams?.get("category") ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const list = state.items.filter(
      (r) =>
        matchesCuisine(r, filters.cuisines) &&
        matchesRating(r, filters.ratings) &&
        matchesPrice(r, filters.prices) &&
        matchesDelivery(r, filters.delivery) &&
        matchesOffers(r, filters.offers) &&
        matchesQuery(r, filters.query),
    );
    switch (sort) {
      case "rating":
        return [...list].sort((a, b) => b.rating - a.rating);
      case "delivery":
        return [...list].sort((a, b) => a.timeMin - b.timeMin);
      case "relevance":
      default:
        return list;
    }
  }, [filters, sort, state]);

  /**
   * Distinct cuisines actually present on the loaded restaurants.
   * Partner-added cuisines (e.g. "Bengali Specials") flow through
   * here so the sidebar's Cuisine section can render them as
   * filterable chips without any server-side enumeration.
   *
   * Whitespace-only / empty strings are filtered out so a stray
   * blank cuisine doesn't end up as a checkbox.
   */
  const availableCuisines = useMemo(() => {
    if (state.kind !== "ready") return [];
    const seen = new Map<string, string>();
    for (const r of state.items) {
      const value = r.cuisine.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    }
    return [...seen.values()];
  }, [state]);

  return (
    <main className="min-h-screen w-full bg-surface-page">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-4 py-6 sm:px-6 sm:py-10 lg:px-[64px] lg:py-12">
        <div className="flex items-start gap-4 lg:gap-8">
          {/* Desktop sidebar (lg+). On < lg the sidebar is hidden
              here and re-mounted into a bottom-sheet drawer below. */}
          <div className="hidden lg:block">
            <Sidebar
              state={filters}
              onChange={setFilters}
              availableCuisines={availableCuisines}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-6 lg:gap-8">
            {selectedCategory ? (
              <div
                className="flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3"
                aria-label={t("restaurantsPage.categoryBannerAria", { category: selectedCategory })}
              >
                <div className="flex items-center gap-2 text-[13px] text-ink">
                  <span aria-hidden className="text-brand">🔎</span>
                  <span>
                    {t("restaurantsPage.categoryBannerPrefix")}{" "}
                    <span className="font-semibold text-brand">
                      {selectedCategory}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Drop both the cuisine checkbox AND the URL param
                    // so a stale link doesn't keep the filter after a
                    // user clears the banner.
                    const next = { ...filters };
                    setFilters({
                      ...next,
                      cuisines: new Set<CuisineId>(),
                    });
                    setSelectedCategory(null);
                    const sp = new URLSearchParams(
                      Array.from(searchParams?.entries() ?? []),
                    );
                    sp.delete("category");
                    const qs = sp.toString();
                    window.history.replaceState(
                      null,
                      "",
                      qs ? `/restaurants?${qs}` : "/restaurants",
                    );
                  }}
                  className="grid h-7 w-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white hover:text-ink"
                  aria-label={t("restaurantsPage.clearCategoryAria")}
                >
                  ×
                </button>
              </div>
            ) : null}
            <ListingHeader
              total={visible.length}
              sort={sort}
              onSortChange={setSort}
            />

            {/* Mobile filter button (only visible < lg). The actual
                sidebar is mounted into a bottom-sheet drawer below. */}
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink hover:bg-surface lg:hidden"
            >
              <SlidersIcon size={16} />
              {t("sidebar.filtersTitle")}
            </button>

            {state.kind === "error" ? (
              <div
                role="alert"
                className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-line bg-white text-[14px] font-medium text-ink-muted"
              >
                {t("restaurantsPage.loadFailed", { message: state.message })}
              </div>
            ) : state.kind === "loading" ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-[260px] animate-pulse rounded-2xl border border-line bg-white"
                  />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div
                data-restaurants-empty="true"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center text-[14px] font-medium text-ink-muted"
              >
                {state.items.length === 0 && address ? (
                  <>
                    <p>{t("restaurantsPage.emptyNoAreaTitle")}</p>
                    <p className="text-[13px] text-ink-muted">
                      {t("restaurantsPage.emptyNoAreaHint")}
                    </p>
                  </>
                ) : state.items.length === 0 ? (
                  <>
                    <p>{t("restaurantsPage.emptyAllTitle")}</p>
                    <p className="text-[13px] text-ink-muted">
                      {t("restaurantsPage.emptyAllHint")}
                    </p>
                  </>
                ) : (
                  <p>{t("restaurantsPage.emptyFiltered")}</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((r) => (
                  <RestaurantCard key={r.id} r={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Mobile filter drawer (< lg). Slides up from the bottom
          with a backdrop. Body scroll lock is intentional. */}
      {filterOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("sidebar.filtersTitle")}
        >
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setFilterOpen(false)}
            className="absolute inset-0 bg-black/40"
            tabIndex={-1}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl bg-white shadow-2xl pb-safe">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-[18px] font-extrabold text-ink">
                {t("sidebar.filtersTitle")}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setFilterOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-surface-soft tap-target"
              >
                <CloseIcon size={22} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <Sidebar
                state={filters}
                onChange={setFilters}
                availableCuisines={availableCuisines}
              />
            </div>
            <div className="border-t border-line p-4">
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[15px] font-bold text-white"
              >
                {t("common.submit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Footer />
    </main>
  );
}

/**
 * `useSearchParams` requires being inside a <Suspense> boundary in the
 * Next.js app router (it triggers client-side bailout to Suspense on
 * the server).
 */
export function RestaurantsPage() {
  return (
    <Suspense fallback={null}>
      <RestaurantsPageInner />
    </Suspense>
  );
}
