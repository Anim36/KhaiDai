import { AlertCircleIcon } from "@/components/icons";
import { HeartButton } from "@/components/restaurants/HeartButton";
import { resolveImageUrl } from "@/lib/imageUrl";

type Props = {
  cover: string;
  name: string;
  cuisine: string;
  notice?: string;
  /** Restaurant id — required for the heart toggle to work. */
  restaurantId?: string;
  /** Live average rating from the Review aggregate. */
  rating?: number;
  /** Total review count. */
  reviewsCount?: number;
};

/**
 * Full-width cover banner with a tinted overlay that holds the
 * restaurant name (white, 36px / ExtraBold) and cuisine subtitle
 * (light-gray, 16px). Below the overlay we render an info-bar row
 * that surfaces the rating, address and opening hours, plus an
 * optional inline notice row with an alert-circle icon.
 *
 * The info bar also pins a `<HeartButton />` on the right for
 * signed-in CUSTOMER sessions — saving a restaurant from the
 * detail page uses the same `/api/favorites` endpoint as the card.
 */
export function CoverBanner({ cover, name, cuisine, notice, restaurantId, rating, reviewsCount }: Props) {
  return (
    <section className="flex w-full flex-col items-stretch">
      {/* Banner image with overlay */}
      <div className="relative h-[280px] w-full overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${resolveImageUrl(cover)}')` }}
        />
        {/* Dark gradient overlay so the white headline stays legible. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/0" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-page flex-col justify-end gap-2 px-4 pb-6 sm:px-6 sm:pb-8 lg:px-[64px]">
          <h1 className="w-full font-display text-[36px] font-extrabold leading-none text-white">
            {name}
          </h1>
          <p className="w-full text-[16px] font-normal text-line">
            {cuisine}
          </p>
        </div>
      </div>

      {/* Info bar */}
      <div className="w-full border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-page flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5 lg:px-[64px]">
          <div className="flex items-start gap-8">
            <div className="flex flex-col">
              <p className="font-display text-[22px] font-extrabold leading-none text-ink">
                {name}
              </p>
              <p className="text-[14px] font-normal text-ink-muted">
                {cuisine}
              </p>
            </div>
            {typeof rating === "number" && reviewsCount !== undefined ? (
              <div
                className="ml-2 flex items-center gap-2 rounded-xl bg-surface-rating px-3 py-1.5"
                aria-label="Restaurant rating"
              >
                <span className="font-display text-[16px] font-extrabold text-ink">
                  ★ {rating.toFixed(1)}
                </span>
                <span className="text-[12px] text-ink-muted">
                  ({reviewsCount})
                </span>
              </div>
            ) : null}
          </div>
          {restaurantId ? <HeartButton restaurantId={restaurantId} variant="banner" size={20} /> : null}
        </div>
      </div>

      {/* Optional notice row */}
      {notice && (
        <div className="w-full border-b border-line bg-white">
          <div className="mx-auto flex w-full max-w-page items-center gap-2 px-4 py-3 text-[13px] font-semibold text-ink-muted sm:px-6 lg:px-[64px]">
            <AlertCircleIcon size={16} className="text-ink-muted" />
            <span>{notice}</span>
          </div>
        </div>
      )}
    </section>
  );
}
