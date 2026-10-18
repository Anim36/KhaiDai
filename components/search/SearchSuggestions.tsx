"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/apiClient";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";

/**
 * Live-search dropdown panel for the navbar.
 *
 * The TopNav owns the controlled input value; this component is a
 * sibling positioned absolutely beneath the input. It listens for
 * changes to the `query` prop (debounced), fetches `/api/search`, and
 * renders up to 5 restaurants + 5 dishes plus a "See all" footer
 * that triggers a parent-supplied submit handler (which navigates to
 * /search?q=…).
 *
 * Design notes:
 *   • We deliberately do NOT own the input — the parent form is what
 *     submits the navbar search, and that lets the navbar stay
 *     unchanged from the user's perspective.
 *   • Click-outside + Escape close the panel.
 *   • Loading state: a small "Searching…" chip in the panel.
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
  /** Bound to the navbar input. */
  query: string;
  /** Forwarded from the form's onSubmit so the panel can trigger
   *  a full-page submission (navigate to /search?q=…). */
  onSubmit: () => void;
};

const DEBOUNCE_MS = 350;

export function SearchSuggestions({ query, onSubmit }: Props) {
  const router = useRouter();
  const { address } = useDeliveryAddress();
  const [state, setState] = useState<{
    results: SearchResponse | null;
    loading: boolean;
    error: string | null;
  }>({ results: null, loading: false, error: null });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  const trimmed = query.trim();

  // Debounced fetch whenever the query changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmed.length < 2) {
      setState({ results: null, loading: false, error: null });
      setOpen(false);
      return;
    }
    setOpen(true);
    setState((prev) => ({ results: prev.results, loading: true, error: null }));
    const seq = ++reqSeq.current;
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed, limit: "10" });
      if (
        address &&
        Number.isFinite(address.latitude) &&
        Number.isFinite(address.longitude)
      ) {
        params.set("lat", String(address.latitude));
        params.set("lng", String(address.longitude));
      }
      apiFetch<SearchResponse>(`/api/search?${params.toString()}`)
        .then((res) => {
          if (seq !== reqSeq.current) return;
          if (!res.ok) {
            setState({
              results: null,
              loading: false,
              error: res.error.message,
            });
            return;
          }
          setState({ results: res.data ?? null, loading: false, error: null });
        })
        .catch((err) => {
          if (seq !== reqSeq.current) return;
          setState({
            results: null,
            loading: false,
            error: err instanceof Error ? err.message : "Search failed",
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed, address?.latitude, address?.longitude]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const restaurants = state.results?.matchedRestaurants ?? [];
  const dishes = state.results?.matchedDishes ?? [];
  const topRestaurants = restaurants.slice(0, 5);
  const topDishes = dishes.slice(0, 5);
  const total = restaurants.length + dishes.length;

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute left-0 right-0 top-[52px] z-[1100]"
    >
      {open && trimmed.length >= 2 ? (
        <div
          role="listbox"
          className="pointer-events-auto mx-auto flex max-h-[480px] w-[640px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
        >
          {state.error ? (
            <div
              role="alert"
              className="border-b border-line bg-rose-50 px-4 py-2 text-[12px] font-semibold text-rose-700"
            >
              {state.error}
            </div>
          ) : null}

          {state.loading && total === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-ink-muted">
              <span
                aria-hidden
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-brand"
              />
              Searching…
            </div>
          ) : total === 0 && !state.loading ? (
            <div className="flex flex-col gap-1 px-4 py-4 text-center">
              <span className="text-[13px] font-semibold text-ink">
                কিছু পাওয়া যায়নি
              </span>
              <span className="text-[11px] text-ink-muted">
                Try a different keyword.
              </span>
            </div>
          ) : (
            <>
              {topRestaurants.length > 0 ? (
                <section>
                  <header className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Restaurants
                  </header>
                  <ul className="flex flex-col">
                    {topRestaurants.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          role="option"
                          onMouseDown={(e) => {
                            // mousedown so we beat the blur handler.
                            e.preventDefault();
                            setOpen(false);
                            router.push(`/restaurants/${r.id}`);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface"
                        >
                          <span
                            aria-hidden
                            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-soft"
                          >
                            {r.image ? (
                              <Image
                                src={r.image}
                                alt=""
                                width={36}
                                height={36}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-[14px] font-bold text-ink-muted">
                                {r.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[13px] font-semibold text-ink">
                              {r.name}
                            </span>
                            <span className="truncate text-[11px] text-ink-muted">
                              {r.cuisine}
                              {typeof r.distanceKm === "number"
                                ? ` · ${r.distanceKm.toFixed(1)} km`
                                : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {topDishes.length > 0 ? (
                <section>
                  <header className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Dishes
                  </header>
                  <ul className="flex flex-col">
                    {topDishes.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          role="option"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setOpen(false);
                            router.push(`/restaurants/${d.restaurantId}`);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface"
                        >
                          <span
                            aria-hidden
                            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-soft text-[11px] font-bold text-ink-muted"
                          >
                            {d.image ? (
                              <Image
                                src={d.image}
                                alt=""
                                width={36}
                                height={36}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              "🍽️"
                            )}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[13px] font-semibold text-ink">
                              {d.name}
                            </span>
                            <span className="truncate text-[11px] text-ink-muted">
                              {d.restaurantName} · ৳{d.price}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <footer className="border-t border-line bg-surface-soft">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    onSubmit();
                  }}
                  className="flex w-full items-center justify-center px-4 py-3 text-[12px] font-semibold text-brand transition-colors hover:bg-line"
                >
                  See all results for &quot;{trimmed}&quot; →
                </button>
              </footer>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
