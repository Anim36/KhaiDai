import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  parseComment,
  parseRating,
  projectReview,
} from "@/lib/reviews";

/**
 * POST /api/reviews — submit one review for one order.
 *
 * Body:
 *   {
 *     orderId: string;
 *     kind: "RESTAURANT" | "RIDER";
 *     rating: 1..5;
 *     comment?: string;
 *   }
 *
 * The endpoint enforces:
 *   • Caller is a CUSTOMER.
 *   • The order exists, belongs to the caller, and its status is
 *     DELIVERED. No reviews on cancelled / in-flight orders.
 *   • The discriminator matches the available target on the
 *     order: RESTAURANT reviews need a non-null restaurantId,
 *     RIDER reviews need a non-null riderId. Submitting a RIDER
 *     review on a never-assigned order is rejected.
 *   • One row per (order, kind) — submitting twice returns 409.
 *
 * Response:
 *   201 { review: ReviewDto }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // orderId is mandatory; keep extracting it out separately so we
  // can include it in the response on 404.
  const orderId = typeof b.orderId === "string" ? b.orderId : null;
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  // kind must be one of the two enum literals. We validate against
  // the string union explicitly so a typo doesn't silently slip
  // through as "unknown".
  const kind = b.kind;
  if (kind !== "RESTAURANT" && kind !== "RIDER") {
    return NextResponse.json(
      { error: 'kind must be either "RESTAURANT" or "RIDER"' },
      { status: 400 },
    );
  }

  const ratingParse = parseRating(b.rating);
  if (!ratingParse.ok) {
    return NextResponse.json({ error: ratingParse.error }, { status: 400 });
  }
  const comment = parseComment(b.comment);

  // Look the order up. We need to verify ownership + status + which
  // side is being rated, so we ask for the two id columns too.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      restaurantId: true,
      riderId: true,
      status: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.customerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only review your own orders" },
      { status: 403 },
    );
  }
  if (order.status !== "DELIVERED") {
    return NextResponse.json(
      { error: "Reviews are only allowed for delivered orders" },
      { status: 400 },
    );
  }

  // Discriminator-vs-target check.
  if (kind === "RESTAURANT") {
    if (!order.restaurantId) {
      return NextResponse.json(
        { error: "This order has no restaurant to review" },
        { status: 400 },
      );
    }
  } else {
    if (!order.riderId) {
      return NextResponse.json(
        { error: "This order has no rider to review" },
        { status: 400 },
      );
    }
  }

  // Insert + return. The unique constraint on (orderId, kind)
  // protects us; we catch the friendly P2002 and surface 409.
  try {
    const created = await prisma.review.create({
      data: {
        customerId: auth.user.id,
        orderId,
        kind,
        rating: ratingParse.value,
        comment,
        restaurantId: kind === "RESTAURANT" ? order.restaurantId : null,
        riderId: kind === "RIDER" ? order.riderId : null,
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(
      { review: projectReview(created) },
      { status: 201 },
    );
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      return NextResponse.json(
        { error: `You already submitted a ${kind.toLowerCase()} review for this order` },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to submit review",
      },
      { status: 500 },
    );
  }
}
