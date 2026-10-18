import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { buildInitInput, initSession } from "@/lib/sslcommerz";

/**
 * POST /api/payments/sslcommerz/init
 *
 * Phase 1 of the SSLCommerz round-trip. The CheckoutPage already
 * created an Order at POST /api/orders with
 * `paymentGatewayStatus = NOT_INITIATED`; here we ask SSLCommerz
 * to open a session for that order and write back the session key.
 *
 *   • Body: `{ orderId: string }`
 *   • Customer-only, owns-the-order check (403 if mismatch).
 *   • 409 if the order's payment method is CASH (gateway not
 *     expected) or its status is anything past PENDING (already
 *     paid / already cancelled — re-init would create ghost
 *     sessions).
 *   • On success: Order.paymentGatewayStatus flips to PENDING,
 *     gatewaySessionKey stored; we return the GatewayPageURL for
 *     the frontend to `window.location` into.
 *
 * Why this is async-server and not a Next "redirect" — the
 * CheckoutPage needs the URL back so it can decide between
 * `window.location` (gateway) vs `router.push` (tracking). The
 * server never directly redirects here.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Only customers can initiate payment" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const orderId =
    typeof (body as { orderId?: unknown }).orderId === "string"
      ? ((body as { orderId: string }).orderId as string).trim()
      : "";
  if (!orderId) {
    return NextResponse.json(
      { error: "orderId is required" },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { menuItem: { select: { name: true } } } },
      customer: {
        select: { id: true, name: true, email: true, phone: true },
      },
      restaurant: { select: { name: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.customerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only pay for your own orders" },
      { status: 403 },
    );
  }
  if (order.paymentMethod === "CASH") {
    return NextResponse.json(
      {
        error:
          "Cash on Delivery orders don't go through the payment gateway",
      },
      { status: 409 },
    );
  }
  if (
    order.paymentGatewayStatus !== "NOT_INITIATED" &&
    order.paymentGatewayStatus !== "FAILED" &&
    order.paymentGatewayStatus !== "CANCELLED"
  ) {
    // PENDING means we already have an open session — refuse to
    // stack up multiple sessions. PAID means nothing to do.
    return NextResponse.json(
      {
        error: `Order is already ${order.paymentGatewayStatus.toLowerCase()}`,
        paymentGatewayStatus: order.paymentGatewayStatus,
      },
      { status: 409 },
    );
  }

  let init;
  try {
    init = await initSession(
      buildInitInput({
        orderId: order.id,
        total: order.total,
        customer: {
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
        },
        deliveryAddress: order.deliveryAddress,
        items: order.items.map((i) => ({
          name: i.menuItem.name,
          quantity: i.quantity,
        })),
      }),
    );
  } catch (err) {
    console.error("[/api/payments/sslcommerz/init] gateway call failed", err);
    return NextResponse.json(
      { error: "Could not reach payment gateway" },
      { status: 502 },
    );
  }

  if (init.status !== "SUCCESS") {
    return NextResponse.json(
      {
        error: "Payment gateway refused to open a session",
        reason: init.failedreason,
      },
      { status: 502 },
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentGatewayStatus: "PENDING",
      gatewaySessionKey: init.sessionKey,
      // gatewayTransactionId is reserved for the val_id / bank_tran_id
      // we get back from validation. Don't write it here.
    },
  });

  return NextResponse.json(
    {
      orderId: order.id,
      gatewayPageURL: init.GatewayPageURL,
      sessionKey: init.sessionKey,
    },
    { status: 200 },
  );
}