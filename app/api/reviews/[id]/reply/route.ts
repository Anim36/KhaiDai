import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { projectReview } from "@/lib/reviews";

/**
 * PATCH /api/reviews/[id]/reply — partner reply to a review.
 *
 * Body:
 *   { replyText: string; }
 *
 * Constraints:
 *   • Caller is a PARTNER.
 *   • The review is a RESTAURANT review (RIDER reviews are never
 *     replied to — that's a future workstream).
 *   • The restaurant being reviewed is owned by this partner
 *     (verified via Restaurant.ownerId == auth.user.id).
 *
 * Side-effects:
 *   • replyText + repliedAt get stamped on the Review.
 *
 * Response:
 *   200 { review: ReviewDto }
 *   404 review not found
 *   403 review belongs to a different partner
 *   400 review is a RIDER review (cannot reply)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const reviewId = params.id;
  if (!reviewId) {
    return NextResponse.json({ error: "Missing review id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const rawReply = b.replyText;
  if (typeof rawReply !== "string") {
    return NextResponse.json(
      { error: "replyText is required" },
      { status: 400 },
    );
  }
  const replyText = rawReply.trim().slice(0, 2000);
  if (replyText.length === 0) {
    return NextResponse.json(
      { error: "replyText cannot be empty" },
      { status: 400 },
    );
  }

  // Fetch the review + the related restaurant's owner so we can
  // compare ownership in a single DB round-trip.
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      restaurant: { select: { id: true, ownerId: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  if (existing.kind !== "RESTAURANT") {
    return NextResponse.json(
      { error: "Rider reviews cannot be replied to" },
      { status: 400 },
    );
  }
  if (!existing.restaurant || existing.restaurant.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only reply to reviews of your own restaurant" },
      { status: 403 },
    );
  }

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: { replyText, repliedAt: new Date() },
    include: { customer: { select: { id: true, name: true } } },
  });
  return NextResponse.json(
    { review: projectReview(updated) },
    { status: 200 },
  );
}
