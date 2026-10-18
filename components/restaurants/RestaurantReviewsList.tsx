"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/apiClient";
import { StarIcon } from "@/components/icons";
import {
  type ReviewDto,
  type ReviewSummary,
} from "@/lib/reviews";
import { ReviewModal } from "@/components/orders/ReviewModal";

/**
 * RestaurantReviewsList — full reviews panel for /restaurants/[id].
 *
 * Two states stitched together:
 *   • `Restaurants.Hero/Header` shows the average + count above
 *     this list — the chip is computed from `summary` so a freshly
 *     loaded average never goes out of sync with the list below.
 *   • `ReviewModal` is opened from the rate-order workflow — for
 *     a customer who has a delivered order for this restaurant, the
 *     "Rate this order" button pre-fills the modal with their
 *     draft ratings.
 *
 * Pagination is cursor-based to stay stable across insertions. We
 * keep loading more on demand via the "Show more reviews" button
 * at the bottom — enough for the customer flow without ever
 * slamming the API on scroll.
 */

type Props = {
  restaurantId: string;
  /** Optional list of recent orders the customer has delivered
   *  from THIS restaurant — used to surface the "Rate" CTA. */
  rateableOrders?: Array<{ id: string; status: string }>;
};

const PAGE_SIZE = 10;

export function RestaurantReviewsList({ restaurantId, rateableOrders = [] }: Props) {
  const { user } = useAuth();
  const isCustomer = user?.role === "CUSTOMER";
  const canRate = isCustomer && rateableOrders.length > 0;

  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({
    count: 0,
    average: 0,
    breakdown: [0, 0, 0, 0, 0],
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which order to rate + whether the modal is open. We always pick
  // the first delivered-but-not-rated order for this restaurant.
  const [rateOpenFor, setRateOpenFor] = useState<string | null>(null);

  // First-page load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<{
      reviews: ReviewDto[];
      summary: ReviewSummary;
      nextCursor: string | null;
    }>(`/api/restaurants/${restaurantId}/reviews?limit=${PAGE_SIZE}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setReviews(res.data?.reviews ?? []);
        setSummary(
          res.data?.summary ?? {
            count: 0,
            average: 0,
            breakdown: [0, 0, 0, 0, 0],
          },
        );
        setCursor(res.data?.nextCursor ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load reviews");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  async function loadMore() {
    if (!cursor || loadMoreBusy) return;
    setLoadMoreBusy(true);
    try {
      const res = await apiFetch<{
        reviews: ReviewDto[];
        summary: ReviewSummary;
        nextCursor: string | null;
      }>(
        `/api/restaurants/${restaurantId}/reviews?limit=${PAGE_SIZE}&cursor=${cursor}`,
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setReviews((prev) => [...prev, ...(res.data?.reviews ?? [])]);
      setCursor(res.data?.nextCursor ?? null);
      // summary is the FULL average count, not the page average —
      // we only need it on first load; subsequent calls keep it.
    } finally {
      setLoadMoreBusy(false);
    }
  }

  function refreshAfterSubmit() {
    // Re-load first page to pick up the new review (or the updated
    // existing one). Cheapest correct refresh.
    setLoading(true);
    apiFetch<{
      reviews: ReviewDto[];
      summary: ReviewSummary;
      nextCursor: string | null;
    }>(`/api/restaurants/${restaurantId}/reviews?limit=${PAGE_SIZE}`)
      .then((res) => {
        if (res.ok && res.data) {
          setReviews(res.data.reviews ?? []);
          setSummary(
            res.data.summary ?? {
              count: 0,
              average: 0,
              breakdown: [0, 0, 0, 0, 0],
            },
          );
          setCursor(res.data.nextCursor ?? null);
        }
      })
      .finally(() => setLoading(false));
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-[22px] font-extrabold text-ink">
            Customer Reviews
          </h2>
          <p className="text-[13px] text-ink-muted">
            Real reviews from completed KhaiDai deliveries.
          </p>
        </div>
        {canRate ? (
          <button
            type="button"
            onClick={() => setRateOpenFor(rateableOrders[0]!.id)}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Rate this order
          </button>
        ) : null}
      </header>

      {/* Average chip — always reflects the latest summary, even
          when the list below is paginated. */}
      <SummaryCard summary={summary} />

      {/* List */}
      {loading ? (
        <SkeletonList count={3} />
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
        >
          Couldn&apos;t load reviews: {error}
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-10 text-center">
          <span className="font-display text-[16px] font-extrabold text-ink">
            No reviews yet
          </span>
          <p className="max-w-xs text-[13px] text-ink-muted">
            Be the first to rate this restaurant — your feedback helps
            other customers decide.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadMoreBusy}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink-muted hover:bg-line disabled:opacity-50"
          >
            {loadMoreBusy ? "Loading…" : "Show more reviews"}
          </button>
        </div>
      ) : null}

      {rateOpenFor ? (
        <ReviewModal
          orderId={rateOpenFor}
          onClose={() => setRateOpenFor(null)}
          onSubmitted={refreshAfterSubmit}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function SummaryCard({ summary }: { summary: ReviewSummary }) {
  const { count, average, breakdown } = summary;
  const max = Math.max(1, ...breakdown);
  const starsFull = Math.round(average);
  if (count === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-soft font-display text-[18px] font-extrabold text-ink-muted">
          ★
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[16px] font-bold text-ink">
            Not yet rated
          </span>
          <span className="text-[12px] text-ink-muted">
            This restaurant hasn&apos;t received any reviews.
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-rating">
          <span className="font-display text-[24px] font-extrabold text-ink">
            {average.toFixed(1)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <StarIcon
                key={n}
                size={18}
                className={
                  n <= starsFull ? "text-amber-500" : "text-line"
                }
                style={{
                  fill: n <= starsFull ? "currentColor" : "transparent",
                }}
              />
            ))}
          </div>
          <span className="text-[12px] text-ink-muted">
            Based on {count} review{count === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {breakdown
          .map((count, idx) => ({ stars: idx + 1, count }))
          .reverse()
          .map((row) => (
            <div
              key={row.stars}
              className="flex items-center gap-2 text-[12px] text-ink-muted"
            >
              <span className="w-6 font-semibold">{row.stars}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right text-ink">{row.count}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: ReviewDto }) {
  const dateLabel = (() => {
    const d = new Date(review.createdAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  })();
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 font-display text-[13px] font-extrabold text-brand">
          {review.author.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-ink">
            {review.author.name}
          </span>
          <span className="text-[12px] text-ink-muted">{dateLabel}</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n <= review.rating;
            return (
              <StarIcon
                key={n}
                size={16}
                className={active ? "text-amber-500" : "text-line"}
                style={{
                  fill: active ? "currentColor" : "transparent",
                }}
              />
            );
          })}
        </div>
      </div>
      {review.comment ? (
        <p className="text-[14px] leading-relaxed text-ink">
          {review.comment}
        </p>
      ) : null}
      {review.replyText ? (
        <div className="mt-2 rounded-xl border-l-2 border-brand bg-brand-50 p-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand">
            Owner reply
          </span>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            {review.replyText}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
          <div className="h-3 w-full animate-pulse rounded bg-surface" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface" />
        </li>
      ))}
    </ul>
  );
}
