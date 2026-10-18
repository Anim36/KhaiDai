"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRightIcon,
  ClockIcon,
  MapPinIcon,
  StarIcon,
  TruckIcon,
} from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";
import { formatDistanceKm } from "@/lib/geo";
import { resolveImageUrl } from "@/lib/imageUrl";
import type { Restaurant } from "@/data/restaurants";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * "Popular Restaurants Near You" section on the homepage.
 *
 *   • Fetches from `/api/restaurants` and renders the first 4 cards.
 *     The API is the single source of truth — adding a new
 *     restaurant on the partner dashboard makes it appear here
 *     on the next page load.
 *   • Loading → 4 placeholder cards. Empty → "No restaurants yet"
 *     card. Error → a subtle alert banner.
 *   • The header's "See All" link points at /restaurants.
 *
 * The id values come from Prisma so clicking a card lands on the
 * matching `/restaurants/[id]` detail page.
 */
export function PopularRestaurants() {
  // Re-fetch the carousel when the customer picks a new address so the
  // list ranks by distance from that pin. Without an address the API
  // returns every restaurant (newest first) and the carousel still
  // shows the first 4.
  const { address } = useDeliveryAddress();
  const t = useT();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; items: Restaurant[] }
    | { kind: "empty" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
      const list = res.data?.restaurants ?? [];
      if (list.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({ kind: "ready", items: list.slice(0, 4) });
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

  return (
    <section className="flex w-full flex-col items-start gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-[64px]">
      <div className="flex w-full items-center justify-between">
        <h2 className="font-display text-[22px] font-extrabold text-ink sm:text-[28px]">
          {t("home.restaurantsTitle")}
        </h2>
        <Link
          href="/restaurants"
          className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand hover:underline"
        >
          {t("home.seeAll")}
          <ArrowRightIcon size={16} />
        </Link>
      </div>

      {state.kind === "error" ? (
        <div
          role="alert"
          className="flex w-full items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-[14px] font-medium text-ink-muted"
        >
          {t("home.restaurantsLoadFailed")}: {state.message}
        </div>
      ) : state.kind === "empty" ? (
        <div
          data-restaurants-empty="true"
          className="flex w-full items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-[14px] font-medium text-ink-muted"
        >
          {t("home.restaurantsEmpty")}
        </div>
      ) : (
        <div
          className={
            state.kind === "loading"
              ? "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4"
              : "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4"
          }
        >
          {state.kind === "loading"
            ? [0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)
            : state.items.map((r) => (
                <Card key={r.id} r={r} />
              ))}
        </div>
      )}
    </section>
  );
}

function Card({ r }: { r: Restaurant }) {
  const t = useT();
  // Bug 3 — when the restaurant is offline, render the card in a
  // muted style (opacity + grayscale) and surface a "Currently
  // Offline" overlay so the customer knows the listing is for
  // menu-viewing only; ordering is blocked on the detail page.
  const isOffline = r.isAcceptingOrders === false;
  return (
    <Link
      href={`/restaurants/${r.id}`}
      data-restaurant-link={r.id}
      data-restaurant-name={r.name}
      data-restaurant-card-offline={isOffline ? "true" : undefined}
      aria-label={
        isOffline
          ? `${r.name} — ${t("home.currentlyOffline")}`
          : `${r.name} restaurant`
      }
      className={
        "relative flex min-w-0 flex-1 flex-col items-start overflow-hidden rounded-2xl border border-line bg-white transition-shadow focus:outline-none focus:ring-2 focus:ring-brand " +
        (isOffline
          ? "opacity-60 grayscale hover:opacity-70 hover:shadow-none"
          : "hover:shadow-md")
      }
    >
      <div
        aria-hidden
        className="h-40 w-full bg-cover bg-center"
        style={{
          backgroundImage: `url('${resolveImageUrl(r.image, "/assets/rest-1.png")}')`,
        }}
      />

      {isOffline ? (
        <span
          data-restaurant-card-closed="true"
          className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"
        >
          <span aria-hidden>⏸</span>
          {t("home.currentlyOffline")}
        </span>
      ) : null}

      <div className="flex w-full flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-[18px] font-bold text-ink">
            {r.name}
          </h3>
          <p className="text-[13px] font-normal text-ink-muted">{r.cuisine}</p>
        </div>

        <div className="h-px w-full bg-line" />

        {typeof r.distanceKm === "number" ? (
          <span
            aria-label={`${formatDistanceKm(r.distanceKm)} ${t("home.away")}`}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand"
          >
            <MapPinIcon size={12} className="text-brand" />
            {formatDistanceKm(r.distanceKm)} {t("home.away")}
          </span>
        ) : null}

        <div className="flex w-full items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-rating px-2 py-1">
            <StarIcon size={14} className="text-brand" />
            <span className="text-[13px] font-semibold text-ink">
              {r.rating.toFixed(1)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-ink">
            <ClockIcon size={14} />
            <span className="text-[13px] font-semibold">
              {r.timeMin} min
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-ink">
            <TruckIcon size={14} className="text-brand" />
            <span className="text-[13px] font-semibold">
              {/* Delivery fee is platform-owned; the card shows the
                  base fee as "from ৳30". The exact fee for the
                  customer's chosen pin is fetched on the
                  restaurant/checkout screens via
                  /api/delivery-fee/estimate. */}
              from ৳{r.deliveryFee}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-stretch overflow-hidden rounded-2xl border border-line bg-white">
      <div className="h-40 w-full animate-pulse bg-surface" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-5 w-3/5 animate-pulse rounded bg-surface" />
        <div className="h-4 w-2/5 animate-pulse rounded bg-surface" />
        <div className="h-px w-full bg-line" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-surface" />
      </div>
    </div>
  );
}
