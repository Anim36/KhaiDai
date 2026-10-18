import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { projectReview, summarizeReviews } from "@/lib/reviews";

/**
 * GET /api/partner/reviews — partner's own restaurant reviews.
 *
 * Convenience for the partner dashboard — the partner doesn't have
 * to look up their own restaurant id first, we resolve it from the
 * JWT. Same shape as /api/restaurants/[id]/reviews.
 *
 * Response:
 *   200 {
 *     restaurantId: string | null;
 *     reviews: ReviewDto[];
 *     summary: ReviewSummary;
 *     nextCursor: string | null;
 *   }
 *
 * restaurantId is null when the partner hasn't created a
 * restaurant yet (empty review list in that case).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Resolve the partner's restaurant. A partner owns at most one
  // restaurant in the catalog so this is safe.
  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });

  if (!restaurant) {
    return NextResponse.json(
      {
        restaurantId: null,
        reviews: [],
        summary: { count: 0, average: 0, breakdown: [0, 0, 0, 0, 0] },
        nextCursor: null,
      },
      { status: 200 },
    );
  }

  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "20", 10) || 20, 1),
    50,
  );

  const reviews = await prisma.review.findMany({
    where: { restaurantId: restaurant.id, kind: "RESTAURANT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursorRaw ? { cursor: { id: cursorRaw }, skip: 1 } : {}),
    include: { customer: { select: { id: true, name: true } } },
  });

  const hasMore = reviews.length > limit;
  const trimmed = hasMore ? reviews.slice(0, limit) : reviews;
  const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;

  const allForSummary = await prisma.review.findMany({
    where: { restaurantId: restaurant.id, kind: "RESTAURANT" },
    select: { rating: true },
  });
  const summary = summarizeReviews(allForSummary);

  return NextResponse.json(
    {
      restaurantId: restaurant.id,
      reviews: trimmed.map(projectReview),
      summary,
      nextCursor,
    },
    { status: 200 },
  );
}
