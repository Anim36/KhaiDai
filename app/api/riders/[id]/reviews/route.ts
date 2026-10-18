import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectReview, summarizeReviews } from "@/lib/reviews";

/**
 * GET /api/riders/[id]/reviews — list a rider's reviews.
 *
 * Public endpoint — anyone can read a rider's reviews.
 *
 * Pagination & shape mirror /api/restaurants/[id]/reviews; only
 * the target id (rider's User.id) and kind=RIDER differ. We
 * filter on `riderId = id` because the unique key here is the
 * rider, not the restaurant.
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
  const riderId = params.id;
  if (!riderId) {
    return NextResponse.json({ error: "Missing rider id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "20", 10) || 20, 1),
    50,
  );

  // Make sure the rider user exists (and is actually a RIDER).
  // We scope to RIDER because someone passing the wrong id would
  // otherwise see reviews about a CUSTOMER's order (which is empty
  // for non-riders, but still better UX to 404 cleanly).
  const user = await prisma.user.findUnique({
    where: { id: riderId },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Rider not found" }, { status: 404 });
  }

  const reviews = await prisma.review.findMany({
    where: { riderId, kind: "RIDER" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursorRaw ? { cursor: { id: cursorRaw }, skip: 1 } : {}),
    include: { customer: { select: { id: true, name: true } } },
  });

  const hasMore = reviews.length > limit;
  const trimmed = hasMore ? reviews.slice(0, limit) : reviews;
  const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;

  const allForSummary = await prisma.review.findMany({
    where: { riderId, kind: "RIDER" },
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
