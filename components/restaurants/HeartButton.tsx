"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartIcon } from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/apiClient";

/**
 * Reusable favorite-toggle button. Used by:
 *
 *   • `<RestaurantCard />` — overlaid on the card image, top-right.
 *   • `<CoverBanner />`     — pinned to the right of the restaurant
 *                             name on the detail page.
 *
 * Behaviour:
 *
 *   • On mount the button looks up
 *     `GET /api/favorites/[restaurantId]` to prime the heart state,
 *     but ONLY when the user is a signed-in CUSTOMER. Guests and
 *     partners/riders never see the toggle in this state — the
 *     host component conditionally renders it.
 *   • Click → optimistic flip → POST or DELETE. The toggle flips
 *     back if the request fails.
 *   • If the click happens while not logged in, we bounce to
 *     `/login?redirect=…` so the heart works the moment the user
 *     comes back.
 *
 * Styling:
 *
 *   • `variant="overlay"` — semi-transparent white pill that sits
 *     over the cover image (used by the card).
 *   • `variant="banner"` — solid white pill with brand-red heart
 *     when active (used by the detail page).
 */
export function HeartButton({
  restaurantId,
  variant = "overlay",
  size = 18,
  className = "",
}: {
  restaurantId: string;
  variant?: "overlay" | "banner";
  size?: number;
  className?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  const isCustomer = user?.role === "CUSTOMER";

  // Prime the heart on mount so the icon reflects the saved state
  // even after a hard refresh.
  useEffect(() => {
    if (!isCustomer) return;
    let cancelled = false;
    async function load() {
      const res = await apiFetch<{ isFavorite?: boolean }>(
        `/api/favorites/${restaurantId}`,
      );
      if (cancelled) return;
      if (res.ok && typeof res.data?.isFavorite === "boolean") {
        setFavorited(res.data.isFavorite);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, isCustomer]);

  const toggle = useCallback(async () => {
    if (!isCustomer) {
      // Send guests through the login flow so the heart works
      // immediately on the way back.
      const redirect = `/restaurants/${restaurantId}`;
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    if (loading) return;
    const next = !favorited;
    setFavorited(next); // optimistic
    setLoading(true);
    const res = await apiFetch<unknown>(
      `/api/favorites/${restaurantId}`,
      {
        method: next ? "POST" : "DELETE",
        // POST needs a body even when it's empty — the body is
        // optional on the server but a few proxies complain about
        // POST without content-length.
        body: next ? "{}" : undefined,
      },
    );
    setLoading(false);
    if (!res.ok) {
      // Roll back on error so the UI matches the truth.
      setFavorited(!next);
    }
  }, [isCustomer, loading, favorited, restaurantId, router]);

  const base =
    "flex h-9 w-9 items-center justify-center rounded-full transition-colors";
  const variantClasses =
    variant === "overlay"
      ? "bg-white/85 backdrop-blur-sm hover:bg-white"
      : favorited
        ? "bg-brand text-white hover:bg-brand/90"
        : "bg-white text-ink-muted border border-line hover:text-brand hover:border-brand";
  const colorClasses =
    variant === "overlay"
      ? favorited
        ? "text-brand"
        : "text-ink-muted"
      : "";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      data-favorite={favorited}
      data-restaurant-id={restaurantId}
      className={`${base} ${variantClasses} ${colorClasses} ${className}`}
    >
      <HeartIcon size={size} filled={favorited} />
    </button>
  );
}
