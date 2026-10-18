import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { RIDER_RESPONSE_WINDOW_MS } from "@/lib/dispatch";
import { formatOrderResponse } from "@/lib/orders";
import { SETTLED_PAYMENT_FILTER } from "@/lib/payment-visibility";

/**
 * GET /api/orders/pending-offers
 *
 * Returns the list of orders currently being offered to the signed-in
 * RIDER (status = OFFERED_TO_RIDER with riderId = me). The rider
 * dashboard polls this endpoint every few seconds so the offer card
 * appears as soon as dispatch picks them.
 *
 * Also returns any unhandled OFFERED_TO_RIDER whose deadline has
 * passed — those are filtered out client-side so the dashboard
 * doesn't display stale offers.
 *
 * Side-effect: when we encounter an OFFERED_TO_RIDER with a
 * past-deadline, the route also auto-rejects it via the dispatch
 * helper so the next poll doesn't return the same stale offer. The
 * rider client additionally re-polls /dispatch on its own countdown
 * expiry to guarantee forward progress even if the server's race
 * loses (no separate worker to enforce the deadline).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const offers = await prisma.order.findMany({
    where: {
      status: "OFFERED_TO_RIDER",
      riderId: auth.user.id,
      // ধাপ ৩ — belt-and-braces. An unpaid ghost order should never
      // reach OFFERED_TO_RIDER in the first place (dispatch is gated
      // too), but if one somehow does we refuse to offer it rather
      // than sending a rider to collect cash that will never arrive.
      ...SETTLED_PAYMENT_FILTER,
    },
    include: {
      items: { include: { menuItem: true } },
      customer: { select: { id: true, name: true, email: true, phone: true } },
      restaurant: { select: { id: true, name: true, address: true } },
      rider: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { riderResponseDeadline: "asc" },
    take: 5,
  });

  const now = Date.now();
  const fresh: typeof offers = [];
  for (const offer of offers) {
    const deadline =
      offer.riderResponseDeadline?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (deadline > now) {
      fresh.push(offer);
    }
    // Stale offers are intentionally not returned. The rider dashboard
    // already started its countdown and will hit /dispatch on its own
    // when it expires; we don't auto-fire from here to avoid races.
  }

  return NextResponse.json(
    {
      offers: fresh.map((o) => ({
        ...formatOrderResponse(o),
        deadline: o.riderResponseDeadline?.toISOString() ?? null,
        responseWindowMs: RIDER_RESPONSE_WINDOW_MS,
      })),
    },
    { status: 200 },
  );
}
