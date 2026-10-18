import type { Review, ReviewKind, User } from "@prisma/client";

// Re-export so consumers can import the union type alongside the
// review helpers without needing both `@prisma/client` and this
// module on their import line.
export type { ReviewKind } from "@prisma/client";

/**
 * lib/reviews.ts — shared review projections + aggregation.
 *
 * Why a module-level helper instead of inline API code:
 *   • The same row shape is consumed by `/api/restaurants/[id]/reviews`,
 *     `/api/riders/[id]/reviews` and (in the future) the partner
 *     dashboard. Keeping the projection here keeps all three lists
 *     byte-for-byte identical.
 *   • The 5-star breakdown helper is used both for the restaurant
 *     card chip on the homepage and the partner reviews page —
 *     putting it here means the same logic drives both surfaces.
 */

/* -------------------------------------------------------------------------- */
/*  DTO shapes                                                                */
/* -------------------------------------------------------------------------- */

/** Lightweight customer snippet returned alongside every review. */
export type ReviewAuthor = {
  id: string;
  name: string;
};

/** Public review shape — fields safe to expose to anyone (incl.
 *  partner/rider public profile pages). */
export type ReviewDto = {
  id: string;
  orderId: string;
  kind: ReviewKind;
  rating: number;
  comment: string | null;
  replyText: string | null;
  repliedAt: string | null;
  createdAt: string;
  author: ReviewAuthor;
  /** Always present for RESTAURANT reviews, null for RIDER reviews.
   *  Echoed back so the partner dashboard can deep-link to the order. */
  restaurantId: string | null;
  riderId: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Projectors                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Map a Prisma `Review` (with `customer` joined) into the wire
 * DTO. The author is intentionally just `name + id` so we don't
 * leak email / phone / etc. onto a public list.
 */
export function projectReview(
  review: Review & { customer: Pick<User, "id" | "name"> },
): ReviewDto {
  return {
    id: review.id,
    orderId: review.orderId,
    kind: review.kind,
    rating: review.rating,
    comment: review.comment,
    replyText: review.replyText,
    repliedAt: review.repliedAt ? review.repliedAt.toISOString() : null,
    createdAt: review.createdAt.toISOString(),
    author: {
      id: review.customer.id,
      name: review.customer.name,
    },
    restaurantId: review.restaurantId,
    riderId: review.riderId,
  };
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                               */
/* -------------------------------------------------------------------------- */

/** Result of aggregating a list of reviews. All three pieces are
 *  what the UI displays — average + count go into the chip on
 *  every restaurant card, and the breakdown drives the histogram
 *  on the partner reviews page. */
export type ReviewSummary = {
  count: number;
  average: number;
  /** Index 0 = 1-star count, index 4 = 5-star count. */
  breakdown: [number, number, number, number, number];
};

/**
 * Aggregate a list of reviews into a summary. Empty list → zero
 * everywhere (never NaN), so the UI can render "—" without special
 * casing.
 */
export function summarizeReviews(
  reviews: Array<Pick<Review, "rating">>,
): ReviewSummary {
  const breakdown: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    const r0 = r.rating;
    if (r0 >= 1 && r0 <= 5) {
      breakdown[r0 - 1] += 1;
      sum += r0;
    }
  }
  const count = reviews.length;
  return {
    count,
    average: count === 0 ? 0 : sum / count,
    breakdown,
  };
}

/* -------------------------------------------------------------------------- */
/*  Validators                                                                */
/* -------------------------------------------------------------------------- */

/** Range-check the 1–5 integer rating. Returns the cleaned value or
 *  a human-readable error string the route can surface to the UI. */
export function parseRating(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: "rating must be a number" };
  }
  if (!Number.isInteger(raw)) {
    return { ok: false, error: "rating must be an integer" };
  }
  if (raw < 1 || raw > 5) {
    return { ok: false, error: "rating must be between 1 and 5" };
  }
  return { ok: true, value: raw };
}

/** Trim + bound the comment to a reasonable size. Empty string is
 *  coerced to null so the DB stores the column as null and we
 *  don't end up with a sea of " " rows. */
export function parseComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 1000);
  return trimmed.length === 0 ? null : trimmed;
}
