import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import {
  type OrderStatusApi,
  orderStatusForApi,
} from "@/lib/orders";
import { auditOrderStatusChange } from "@/lib/audit";
import { creditForOrderRefund } from "@/lib/wallet";

/**
 * POST /api/orders/[id]/cancel
 *
 * Body:
 *   { reason?: string }
 *
 * Cancellation rules:
 *   • Customer can cancel while status ∈ { PENDING, PREPARING }.
 *   • Partner can cancel (reject) their own restaurant's order while
 *     status ∈ { PENDING, PREPARING }. The optional `reason` is
 *     surfaced in the notification.
 *   • Once the order is READY or beyond, neither side may cancel
 *     — the food is already prepared/in-transit. The customer is
 *     told to refuse delivery for a refund flow (post-MVP).
 *
 * Side effects:
 *   • Order.status → CANCELLED.
 *   • `dispatchedRiders` is cleared (no more offers).
 *   • A notification is fired to the OTHER party — i.e. when the
 *     customer cancels, the partner is notified; when the partner
 *     cancels, the customer is notified. This mirrors how KhaiDai's
 *     partner dashboard already notifies the customer on a status
 *     transition.
 *
 * Auth: requires verifyAuth. Role check happens after we read the
 * order so we can produce a precise 404 vs 403.
 */

const CANCELLABLE_FROM: ReadonlyArray<"PENDING" | "PREPARING"> = [
  "PENDING",
  "PREPARING",
];

type Body = {
  reason?: unknown;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  let body: Body = {};
  try {
    // Body is optional; an empty POST is fine.
    if (req.headers.get("content-length")) {
      body = (await req.json()) as Body;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 280) : "";

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      total: true,
      // Feat 3 — refund eligibility only triggers when the
      // gateway already captured the money. COD cancels don't
      // credit any wallet.
      paymentMethod: true,
      paymentGatewayStatus: true,
      customerId: true,
      restaurantId: true,
      restaurant: { select: { id: true, ownerId: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Authorization: only the customer who placed it or the partner
  // who owns the restaurant. Riders can never cancel — they should
  // decline the offer instead.
  const role = auth.user.role;
  const isCustomer = role === "CUSTOMER" && order.customerId === auth.user.id;
  const isPartner =
    role === "PARTNER" && order.restaurant.ownerId === auth.user.id;
  if (!isCustomer && !isPartner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!CANCELLABLE_FROM.includes(order.status as "PENDING" | "PREPARING")) {
    return NextResponse.json(
      {
        error: `Order can no longer be cancelled (status: ${order.status}).`,
      },
      { status: 409 },
    );
  }

  // Apply the cancellation. We also wipe `dispatchedRiders` so the
  // dispatch cron (when one runs) doesn't see stale rider offers on
  // a cancelled order. The wallet refund for the customer happens
  // inside the same transaction (see below).
  let refundResult: { credited: boolean; newBalance: number } = {
    credited: false,
    newBalance: 0,
  };
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        dispatchedRiders: { riders: [] },
      },
    });

    // Feat 3 — partner cancels a PAID order → credit the
    // customer's wallet. COD cancels don't credit (we never took
    // any money). Customer-canceled orders also credit (the
    // cancellation may have been driven by a partner outage, and we
    // want the customer's wallet balance to track the actual
    // money in the system, regardless of who clicked Cancel).
    const isPaid =
      order.paymentMethod !== "CASH" &&
      order.paymentGatewayStatus === "PAID";
    if (isPaid) {
      // Look up the customer's profile id (wallet is keyed by
      // profile, not user, to survive role transitions).
      const profile = await tx.customerProfile.findUnique({
        where: { userId: order.customerId },
        select: { id: true },
      });
      if (profile) {
        const r = await creditForOrderRefund(tx, {
          customerProfileId: profile.id,
          orderId: id,
          amount: order.total,
          description: `Refund for cancelled order #${id.slice(-6).toUpperCase()}`,
        });
        refundResult = r;
      }
    }
    return u;
  });
  void auditOrderStatusChange({
    userId: auth.user.id,
    orderId: id,
    fromStatus: order.status,
    toStatus: updated.status,
    actorRole: isCustomer ? "CUSTOMER" : "PARTNER",
  });

  // Feat 3 — wallet-refund-specific notification. Fired only when
  // a credit actually landed on the wallet (otherwise it's noise).
  if (refundResult && refundResult.credited) {
    void createNotification(order.customerId, {
      title: "Refund added to KhaiDai Wallet",
      message: `Your order was cancelled${
        isCustomer
          ? ""
          : " by the restaurant"
      }. ৳${order.total.toLocaleString()} has been refunded to your KhaiDai Wallet.`,
      type: "ORDER_UPDATE",
      relatedOrderId: id,
    });
  }

  // Fire the cross-party notification. The canceller doesn't need
  // a notification — they just hit the button.
  const status: OrderStatusApi = orderStatusForApi(updated.status);
  if (isCustomer) {
    await createNotification(order.restaurant.ownerId, {
      title: "Order cancelled by customer",
      message: `${order.customer.name} cancelled order #${id.slice(-6).toUpperCase()}${reason ? ` — ${reason}` : ""}.`,
      type: "ORDER_UPDATE",
      relatedOrderId: id,
    });
  } else {
    await createNotification(order.customerId, {
      title: "Order cancelled by restaurant",
      message: `${order.restaurant.name} cancelled your order${reason ? `: ${reason}` : ""}.`,
      type: "ORDER_UPDATE",
      relatedOrderId: id,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      orderId: id,
      status,
    },
    { status: 200 },
  );
}
