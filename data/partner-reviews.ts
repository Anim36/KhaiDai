/**
 * Mock data for the partner reviews page.
 *
 * 8 reviews with varied ratings so every star row + the distribution
 * bars look populated on first paint. The summary numbers (average
 * rating, total count, distribution percentages) are derived from
 * this list so swapping the data updates the summary cards too.
 */

export type Review = {
  id: string;
  customerName: string;
  /** Two-letter avatar fallback (rendered if no image asset). */
  initials: string;
  /** 1-5 inclusive. Drives both the star row + the distribution bar. */
  rating: number;
  date: string;
  body: string;
};

/**
 * The Reviews API isn't wired to the database yet, so the list is
 * intentionally empty. `ReviewSummaryRow` and `ReviewsListPanel`
 * render empty-states instead of fake names/ratings — the existing
 * `averageRating()` / `ratingDistribution()` helpers already handle
 * `items.length === 0` correctly (returning 0 and zeros).
 */
export const reviews: Review[] = [];

/* -------------------------------------------------------------------------- */
/*  Derived summary                                                           */
/* -------------------------------------------------------------------------- */

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

/** Average rating rounded to 1 decimal — matches the dashboard's "4.8 / 5" copy. */
export function averageRating(items: Review[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / items.length) * 10) / 10;
}

/**
 * Distribution buckets: for each star rating, how many reviews
 * received that score. The cards re-normalise to percentages so the
 * bars are always 0-100%.
 */
export function ratingDistribution(items: Review[]): RatingDistribution {
  const dist: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of items) {
    if (r.rating >= 1 && r.rating <= 5) {
      dist[r.rating as 1 | 2 | 3 | 4 | 5]++;
    }
  }
  return dist;
}

/** Convenience: percentage of reviews that received `stars` stars. */
export function ratingPercentage(
  items: Review[],
  stars: 1 | 2 | 3 | 4 | 5,
): number {
  const total = items.length;
  if (total === 0) return 0;
  return Math.round((ratingDistribution(items)[stars] / total) * 100);
}
