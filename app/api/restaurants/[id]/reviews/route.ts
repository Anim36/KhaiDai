import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectReview, summarizeReviews } from "@/lib/reviews";
import { notSoftDeleted } from "@/lib/soft-delete";

/**
 * GET /api/restaurants/[id]/reviews — list a restaurant's reviews.
 *
 * Public endpoint — anyone can read reviews (no auth required).
 * Pagination:
 *   ?cursor=<reviewId>  — cursor on the Review.id field (descending
 *                          createdAt means the next page is "older")
 *   ?limit=<n>           — cap per page, 1..50, default 20.
 *
 * The cursor-based approach keeps the query plan stable regardless
 * of review count and avoids the `OFFSET n` penalty that page-style
 * pagination pays.
 *
 * Response:
 *   200 {
 *     reviews: ReviewDto[];
 *     summary: ReviewSummary;
 *     nextCursor: string | null;
 *   }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const restaurantId = params.id;
  if (!restaurantId) {
    return NextResponse.json({ error: "Missing restaurant id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "20", 10) || 20, 1),
    50,
  );

  // Confirm the restaurant exists *and* isn't soft-deleted. Without
  // the soft-delete filter we'd happily serve reviews for a
  // partner-deleted restaurant, which makes the URL impossible to
  // distinguish from a never-existed id.
  const exists = await prisma.restaurant.findFirst({
    where: { ...notSoftDeleted(), id: restaurantId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const reviews = await prisma.review.findMany({
    where: { restaurantId, kind: "RESTAURANT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // fetch one extra so we can decide if there's another page
    ...(cursorRaw
      ? { cursor: { id: cursorRaw }, skip: 1 }
      : {}),
    include: { customer: { select: { id: true, name: true } } },
  });

  const hasMore = reviews.length > limit;
  const trimmed = hasMore ? reviews.slice(0, limit) : reviews;
  const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;

  // Summary is computed across the FULL set of reviews, not just
  // the current page — the partner reviews page shows a histogram
  // that should reflect every rating, not the visible 20.
  const allForSummary = await prisma.review.findMany({
    where: { restaurantId, kind: "RESTAURANT" },
    select: { rating: true },
  });
  const summary = summarizeReviews(allForSummary);

  return NextResponse.json(
    {
      reviews: trimmed.map(projectReview),
      summary,
      nextCursor,
    },
    { status: 200 },
  );
}
