"use client";

import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/home/TopNav";
import { Footer } from "@/components/home/Footer";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { MenuItemCard } from "@/components/restaurants/MenuItemCard";
import { apiFetch } from "@/lib/apiClient";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";

/**
 * Search results orchestrator for /search.
 *
 *   • Hydrates with the URL's `q` parameter (set by the navbar submit)
 *     and re-fetches `/api/search` whenever the user edits the input.
 *   • Threads the customer's pin (lat/lng) from the global delivery-
 *     address context so the same 5 km radius the navbar dropdown
 *     applies also scopes the full grid.
 *   • Two sections: matched restaurants and matched dishes. Each
 *     dish row carries the parent restaurant's name as a clickable
 *     link to the restaurant detail page.
 *
 * Visual design reuses the existing `<RestaurantCard />` +
 * `<MenuItemCard />` so the result page stays visually consistent
 * with the listing pages — this component is purely an orchestrator.
 */

type SearchRestaurantDto = {
  id: string;
  name: string;
  cuisine: string;
  image: string;
  distanceKm?: number;
};

type SearchDishDto = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  category: string;
  popular: boolean;
  restaurantId: string;
  restaurantName: string;
  distanceKm?: number;
};

type SearchResponse = {
  matchedRestaurants: SearchRestaurantDto[];
  matchedDishes: SearchDishDto[];
  scoped: boolean;
};

type Props = {
  initialQuery: string;
  origin: { lat: number; lng: number } | null;
};

const LIMIT = 24;

export function SearchResultsPage({ initialQuery, origin: initialOrigin }: Props) {
  const { address } = useDeliveryAddress();
  // Prefer the live customer pin from the address context — that's
  // what the navbar dropdown uses too — and fall back to the URL
  // param when there's no address picked yet.
  const origin = useMemo(() => {
    if (
      address &&
      Number.isFinite(address.latitude) &&
      Number.isFinite(address.longitude)
    ) {
      return { lat: address.latitude, lng: address.longitude };
    }
    return initialOrigin;
  }, [address, initialOrigin]);

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch + on query/origin changes. We deliberately don't
  // add a debounce here — the navbar already debounces before it
  // submits the form, and a typing-driven live result on the full
  // grid is usually what the user expects after pressing Enter.
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      q,
      limit: String(LIMIT),
    });
    if (origin) {
      params.set("lat", String(origin.lat));
      params.set("lng", String(origin.lng));
    }
    apiFetch<SearchResponse>(`/api/search?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setResults(res.data ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, origin?.lat, origin?.lng]);

  const restaurants = results?.matchedRestaurants ?? [];
  const dishes = results?.matchedDishes ?? [];
  const totalCount = restaurants.length + dishes.length;
  const hasResults = totalCount > 0;

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-surface-page">
        <section className="mx-auto w-full max-w-page px-6 py-10 md:px-[64px] md:py-12">
          {/* Page header — mirrors the homepage search-hero pattern
              so the user feels oriented. The input is editable so a
              customer can refine the query without bouncing back to
              the navbar. */}
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-brand">
              Search
            </span>
            <h1 className="font-display text-[32px] font-extrabold leading-tight text-ink md:text-[40px]">
              {query.trim().length >= 2
                ? `Results for "${query.trim()}"`
                : "Search KhaiDai"}
            </h1>
            <div className="flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
              <span aria-hidden className="text-ink-muted">🔍</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for restaurants, cuisines, or dishes..."
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
                aria-label="Refine search"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
                >
                  ×
                </button>
              ) : null}
            </div>
            <p className="text-[12px] text-ink-muted">
              {loading
                ? "Searching..."
                : hasResults
                  ? `${totalCount} ${totalCount === 1 ? "match" : "matches"}${results?.scoped ? " within 5 km" : ""}`
                  : query.trim().length >= 2
                    ? "No matches"
                    : "Type at least 2 characters to search."}
            </p>
          </div>

          {/* Error / loading / empty / results */}
          <div className="mt-8">
            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
              >
                {error}
              </div>
            ) : loading ? (
              <SkeletonGrid />
            ) : !hasResults ? (
              query.trim().length < 2 ? (
                <EmptyHint />
              ) : (
                <EmptyState query={query} />
              )
            ) : (
              <ResultsGrid
                restaurants={restaurants}
                dishes={dishes}
              />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function ResultsGrid({
  restaurants,
  dishes,
}: {
  restaurants: SearchRestaurantDto[];
  dishes: SearchDishDto[];
}) {
  return (
    <div className="flex flex-col gap-10">
      {restaurants.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-[20px] font-extrabold text-ink">
            Restaurants
            <span className="ml-2 text-[13px] font-medium text-ink-muted">
              ({restaurants.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((r) => (
              <RestaurantCard
                key={r.id}
                r={{
                  id: r.id,
                  name: r.name,
                  cuisine: r.cuisine,
                  image: r.image,
                  rating: 0,
                  reviews: 0,
                  timeMin: 20,
                  timeMax: 30,
                  deliveryFee: 0,
                  freeDelivery: false,
                  priceBucket: "medium",
                  ...(typeof r.distanceKm === "number"
                    ? { distanceKm: r.distanceKm }
                    : {}),
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {dishes.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-[20px] font-extrabold text-ink">
            Dishes
            <span className="ml-2 text-[13px] font-medium text-ink-muted">
              ({dishes.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dishes.map((d) => (
              <DishCard key={d.id} dish={d} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DishCard({ dish }: { dish: SearchDishDto }) {
  return (
    <MenuItemCard
      item={{
        id: dish.id,
        name: dish.name,
        description: dish.description ?? "",
        price: dish.price,
        image: dish.image ?? "",
        popular: dish.popular,
        category: dish.category,
        available: true,
        restaurantId: dish.restaurantId,
      }}
      restaurantName={dish.restaurantName}
    />
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
      <span className="text-3xl" aria-hidden>🔍</span>
      <span className="font-display text-[18px] font-extrabold text-ink">
        কিছু পাওয়া যায়নি
      </span>
      <p className="max-w-md text-[13px] text-ink-muted">
        We couldn&apos;t find anything matching <span className="font-semibold text-ink">&quot;{query}&quot;</span>.
        Try a different keyword, or browse the full{" "}
        <a href="/restaurants" className="text-brand hover:underline">
          restaurant listing
        </a>
        .
      </p>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
      <span className="text-3xl" aria-hidden>🍽️</span>
      <span className="font-display text-[18px] font-extrabold text-ink">
        Search across restaurants and dishes
      </span>
      <p className="max-w-md text-[13px] text-ink-muted">
        Start typing in the box above — we&apos;ll look across restaurant
        names, cuisines, and dish names.
      </p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[280px] animate-pulse rounded-2xl border border-line bg-white"
        />
      ))}
    </div>
  );
}
