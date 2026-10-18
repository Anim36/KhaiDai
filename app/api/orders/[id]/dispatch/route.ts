import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import {
  RIDER_RESPONSE_WINDOW_MS,
  haversineKm,
  pickNextRider,
  readDispatchedRiders,
  restaurantCoords,
} from "@/lib/dispatch";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/orders/[id]/dispatch
 *
 * Re-runs the nearest-rider dispatch for an order. Idempotent —
 * calling it twice in a row on a freshly-dispatched order will pick
 * the same rider (since dispatchedRiders hasn't grown). Used by:
 *
 *   • The Partner-side PATCH `preparing → ready` flow, immediately
 *     after the partner's status update commits.
 *   • The rider dashboard's "Decline" handler, so the next-nearest
 *     rider is offered right away.
 *   • The rider dashboard's countdown timer — when the response
 *     window expires, the client fires this to advance dispatch.
 *
 * Role-based access:
 *   • PARTNER who owns the order's restaurant
 *   • RIDER assigned to the order (so they can decline / time out)
 *   • The partner-side PATCH hook also uses the PARTNER token
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    /* empty body is OK */
  }
  const patch = (body ?? {}) as { action?: string };

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        restaurant: {
          select: {
            id: true,
            ownerId: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });
    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    // Role gate: PARTNER owns the restaurant; RIDER is the current
    // offered rider (must equal riderId); no other role allowed.
    if (auth.user.role === "PARTNER") {
      if (order.restaurant.ownerId !== auth.user.id) {
        return NextResponse.json(
          { error: "You don't have access to this order" },
          { status: 403 },
        );
      }
    } else if (auth.user.role === "RIDER") {
      if (order.riderId !== auth.user.id) {
        return NextResponse.json(
          { error: "You are not the offered rider for this order" },
          { status: 403 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Only PARTNER or RIDER may trigger dispatch" },
        { status: 403 },
      );
    }

    // ধাপ ৩ — hard payment gate. This is the last line of defence
    // before a rider is dispatched: COD always passes; a gateway
    // order only once SSLCommerz validation confirmed PAID. Without
    // this, a customer who abandons the gateway page would still get
    // their food delivered for free.
    const paymentSettled =
      order.paymentMethod === "CASH" ||
      order.paymentGatewayStatus === "PAID";
    if (!paymentSettled) {
      return NextResponse.json(
        {
          error:
            "This order has not been paid yet — dispatch is blocked until the payment gateway confirms it.",
        },
        { status: 409 },
      );
    }

    // Refuse if the order has already moved past PREPARING /
    // READY / OFFERED_TO_RIDER. The new dispatch-on-accept flow
    // calls this from the partner PATCH `pending → preparing` path
    // — at that point the order is PREPARING with no riderId.
    if (
      order.status !== "PREPARING" &&
      order.status !== "READY" &&
      order.status !== "OFFERED_TO_RIDER"
    ) {
      return NextResponse.json(
        {
          error: `Order is in ${order.status}; dispatch can only run while PREPARING, READY, or OFFERED_TO_RIDER.`,
        },
        { status: 409 },
      );
    }

    const dispatchedRiders = readDispatchedRiders(order.dispatchedRiders);
    const excludeSet = new Set(dispatchedRiders);

    // If the rider is rejecting (decline or timeout), append their
    // userId to the dispatchedRiders list so they aren't offered again.
    const isRejection =
      patch.action === "reject" ||
      (order.status === "OFFERED_TO_RIDER" &&
        order.riderId !== null &&
        auth.user.role === "RIDER");
    if (isRejection && order.riderId) {
      excludeSet.add(order.riderId);
    }

    // If the dispatch deadline on the current OFFER is in the past,
    // also auto-blacklist that rider — same as if they'd declined.
    if (
      order.status === "OFFERED_TO_RIDER" &&
      order.riderResponseDeadline !== null &&
      order.riderResponseDeadline.getTime() < Date.now() &&
      order.riderId
    ) {
      excludeSet.add(order.riderId);
    }

    const coords = restaurantCoords(order.restaurant);
    if (!coords) {
      return NextResponse.json(
        {
          error:
            "Restaurant doesn't have coordinates set — dispatch can't rank nearby riders.",
        },
        { status: 409 },
      );
    }

    const pick = await pickNextRider(
      coords.lat,
      coords.lng,
      Array.from(excludeSet),
    );

    if (!pick.riderId) {
      // No eligible rider nearby. Reset the order to a bare READY
      // state so the next dispatch attempt (e.g. when a rider
      // toggles online, or one becomes "effectively online" after
      // a heartbeat) starts from a clean slate, and emit a system
      // notification for the partner / admin so they're aware.
      // No one left to offer. Reset the order to a bare READY state
      // so the next dispatch attempt (e.g. when a rider toggles
      // online) starts from a clean slate.
      const reset = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "READY",
          riderId: null,
          riderResponseDeadline: null,
          dispatchedRiders: {
            riders: Array.from(excludeSet),
          },
        },
        include: {
          items: { include: { menuItem: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          restaurant: { select: { id: true, name: true, address: true } },
          rider: { select: { id: true, name: true, phone: true } },
        },
      });
      return NextResponse.json(
        {
          order: {
            id: reset.id,
            status: reset.status.toLowerCase(),
            riderId: reset.riderId,
            dispatchedRiders: Array.from(excludeSet),
            exhausted: true,
          },
        },
        { status: 200 },
      );
    }

    const deadline = new Date(Date.now() + RIDER_RESPONSE_WINDOW_MS);
    // New dispatch-on-accept flow: when the order is currently
    // PREPARING (partner just accepted, dispatch fired inline), we
    // keep the status as PREPARING and just stamp the riderId +
    // deadline. The order still rolls forward to READY when the
    // partner "Mark Ready"s. For the pre-existing READY /
    // OFFERED_TO_RIDER pool, we flip to OFFERED_TO_RIDER (legacy
    // "offer-out" status) for backwards-compat with any riders
    // whose dashboard still renders the old pill label.
    const nextStatus =
      order.status === "PREPARING" ? "PREPARING" : "OFFERED_TO_RIDER";
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        riderId: pick.riderId,
        riderResponseDeadline: deadline,
        dispatchedRiders: {
          riders: Array.from(excludeSet),
        },
      },
      include: {
        items: { include: { menuItem: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        restaurant: { select: { id: true, name: true, address: true } },
        rider: { select: { id: true, name: true, phone: true } },
      },
    });

    // Notify the chosen rider. The notification copy carries
    // enough context to make the offer actionable: restaurant
    // name, the rider's current distance to the restaurant pin
    // and the rider's expected earning for this order. Same
    // language on all surfaces (bell widget, admin panel,
    // email) — see step 7 of the rider overhaul.
    //
    // The bell notification is gated on the rider's
    // `notifyNewRequest` preference (Settings → "New delivery
    // request bell"). The dispatch itself, the offer card on
    // the dashboard and the response-countdown are
    // **unaffected** by this flag — they're part of the work
    // flow and a rider who declined the bell still has to be
    // able to accept or decline the offer. Skipping the row
    // is purely a UX decision, not a workflow decision.
    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: pick.riderId },
      select: {
        currentLat: true,
        currentLng: true,
        notifyNewRequest: true,
      },
    });
    const pickupDistanceKm =
      riderProfile?.currentLat !== null &&
      riderProfile?.currentLat !== undefined &&
      riderProfile?.currentLng !== null &&
      riderProfile?.currentLng !== undefined
        ? haversineKm(
            coords.lat,
            coords.lng,
            riderProfile.currentLat,
            riderProfile.currentLng,
          )
        : null;
    const earningsText =
      typeof updated.riderEarning === "number"
        ? `৳${updated.riderEarning} earning`
        : null;
    const distanceText =
      pickupDistanceKm !== null
        ? `${pickupDistanceKm.toFixed(1)} km pickup`
        : null;
    const segments = [
      `New delivery offer from ${updated.restaurant.name}.`,
      distanceText,
      earningsText,
    ].filter((s): s is string => Boolean(s));
    if (riderProfile?.notifyNewRequest !== false) {
      // Default is `true`; we treat `false` as opt-out. Anything
      // else (legacy rows before the column was added) also gets
      // notified — better to over-deliver than to miss an offer.
      await createNotification(pick.riderId, {
        title: "New delivery offer",
        message: `${segments.join(" — ")}. Tap to accept or decline.`,
        type: "ORDER_UPDATE",
        relatedOrderId: updated.id,
      });
    }

    return NextResponse.json(
      {
        order: {
          id: updated.id,
          status: updated.status.toLowerCase(),
          riderId: updated.riderId,
          deadline: deadline.toISOString(),
          responseWindowMs: RIDER_RESPONSE_WINDOW_MS,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("dispatch failed", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Dispatch failed",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/orders/[id]/dispatch
 *
 * Returns the dispatch state for an order (status, riderId,
 * deadline, already-dispatched rider list). Useful for debug
 * tooling or for a partner dashboard that wants to surface
 * "rider is en route" / "looking for rider" without polling the
 * full order resource.
 *
 * Accessible to the restaurant's PARTNER + the offered RIDER + the
 * CUSTOMER who placed the order.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      restaurant: { select: { id: true, ownerId: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (auth.user.role === "CUSTOMER" && order.customerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You don't have access to this order" },
      { status: 403 },
    );
  }
  if (auth.user.role === "PARTNER" && order.restaurant.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You don't have access to this order" },
      { status: 403 },
    );
  }
  if (
    auth.user.role === "RIDER" &&
    order.riderId !== null &&
    order.riderId !== auth.user.id
  ) {
    return NextResponse.json(
      { error: "You are not the offered rider for this order" },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      dispatch: {
        orderId: order.id,
        status: order.status.toLowerCase(),
        riderId: order.riderId,
        deadline: order.riderResponseDeadline?.toISOString() ?? null,
        responseWindowMs: RIDER_RESPONSE_WINDOW_MS,
        dispatchedRiders: readDispatchedRiders(order.dispatchedRiders),
      },
    },
    { status: 200 },
  );
}
