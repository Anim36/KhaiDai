"use client";

import Link from "next/link";
import { ClockIcon, MapPinIcon, StarIcon, TruckIcon } from "@/components/icons";
import { HeartButton } from "@/components/restaurants/HeartButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDistanceKm } from "@/lib/geo";
import { resolveImageUrl } from "@/lib/imageUrl";
import type { Restaurant } from "@/data/restaurants";
import { useT } from "@/lib/i18n/LocaleProvider";

type Props = {
  r: Restaurant;
};

function rupee(n: number) {
  return `৳${n}`;
}

export function RestaurantCard({ r }: Props) {
  const t = useT();
  const { user } = useAuth();
  const showHeart = user?.role === "CUSTOMER";
  // Bug 3 — `false` (or `undefined` legacy rows) mark the
  // restaurant as offline. The customer can still click into the
  // detail page (we don't want a hard 404 — they may want to see
  // the menu anyway), but the card is rendered with reduced
  // opacity + grayscale so it visually ranks below online ones.
  // The detail page disables ordering when this flag is off.
  const isOffline = r.isAcceptingOrders === false;
  return (
    <Link
      href={`/restaurants/${r.id}`}
      aria-label={isOffline ? t("restaurantCard.currentlyOfflineAria", { name: r.name }) : r.name}
      data-restaurant-card-offline={isOffline ? "true" : undefined}
      className={
        "relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition-shadow focus:outline-none focus:ring-2 focus:ring-brand " +
        (isOffline
          ? "opacity-60 grayscale hover:opacity-70 hover:shadow-none"
          : "hover:shadow-md")
      }
    >
      {/* image */}
      <div
        aria-hidden
        className="h-[160px] w-full bg-cover bg-center"
        style={{ backgroundImage: `url('${resolveImageUrl(r.image)}')` }}
      />

      {/* Heart toggle — pinned to the top-right of the cover image.
          Only shown for signed-in customers so partner/rider sessions
          don't see the favorite action. The button stops propagation
          so clicking it doesn't navigate to the restaurant page. */}
      {showHeart ? (
        <div
          className="absolute right-3 top-3"
          // Stop the parent Link from picking up the click; we want
          // the heart to toggle, not to navigate.
          onClick={(e) => e.stopPropagation()}
        >
          <HeartButton restaurantId={r.id} variant="overlay" />
        </div>
      ) : null}

      {/* Bug 3 — "Currently Offline" overlay on the cover image so
          the customer can scan the grid and immediately see which
          restaurants are open. Sits top-left so it doesn't fight
          the heart icon, and uses the same amber palette as the
          restaurant-detail banner so the customer learns to
          recognise the offline state. */}
      {isOffline ? (
        <span
          data-restaurant-card-closed="true"
          className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"
        >
          <span aria-hidden>⏸</span>
          {t("restaurantCard.currentlyOffline")}
        </span>
      ) : null}

      <div className="flex flex-col gap-3 p-4">
        {/* title + rating */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="truncate font-display text-[18px] font-bold text-ink">
              {r.name}
            </h3>
            <p className="truncate text-[13px] font-medium text-ink-muted">
              {r.cuisine}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-rating px-2 py-1">
            <StarIcon size={14} className="text-brand-accent" />
            <span className="font-display text-[13px] font-bold text-ink">
              {r.rating.toFixed(1)}
            </span>
          </span>
        </div>

        {/* Distance chip — only when the API actually computed one. */}
        {typeof r.distanceKm === "number" ? (
          <span
            aria-label={t("restaurantCard.distanceAria", { distance: formatDistanceKm(r.distanceKm) })}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand"
          >
            <MapPinIcon size={12} className="text-brand" />
            {formatDistanceKm(r.distanceKm)} {t("restaurantCard.away")}
          </span>
        ) : null}

        {/* reviews */}
        <p className="text-[12px] font-medium text-ink-muted">
          {t("restaurantCard.reviewsCount", { count: r.reviews.toLocaleString() })}
        </p>

        {/* divider */}
        <div className="h-px w-full bg-line" />

        {/* meta row */}
        <div className="flex w-full items-center justify-between text-[13px] font-semibold text-ink">
          <span className="inline-flex items-center gap-1">
            <ClockIcon size={14} className="text-ink-muted" />
            {r.timeMin}–{r.timeMax} {t("restaurantCard.minSuffix")}
          </span>
          <span className="inline-flex items-center gap-1">
            <TruckIcon size={14} className="text-ink-muted" />
            {r.freeDelivery ? t("restaurantCard.freeDelivery") : rupee(r.deliveryFee)}
          </span>
        </div>

        {/* promo */}
        {r.promo && (
          <span className="inline-flex w-fit items-center rounded-md bg-brand-50 px-2 py-1 text-[12px] font-bold text-brand">
            {r.promo}
          </span>
        )}
      </div>
    </Link>
  );
}
