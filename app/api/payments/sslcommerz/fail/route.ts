import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTransaction } from "@/lib/sslcommerz";

/**
 * GET|POST /api/payments/sslcommerz/fail
 *
 * Phase 2 (browser path) — SSLCommerz redirects here when a
 * payment attempt is declined (insufficient balance, card
 * rejected, gateway timeout, etc).
 *
 * Order of operations:
 *   1. Read tran_id from the query/body.
 *   2. Ask SSLCommerz to validate. This is the subtle part: a
 *      "fail" redirect is ALSO spoofable, but more importantly
 *      the real gateway sometimes bounces the customer to fail_url
 *      even when the charge actually went through (network
 *      flake after the bank approved). So we validate first —
 *      if SSLCommerz says VALID, we treat it as PAID and send
 *      the user to tracking rather than wrongly discarding a real
 *      payment.
 *   3. Otherwise mark FAILED and bounce back to /checkout with
 *      an error. Order.status is left untouched (still PENDING)
 *      so the cart/order can be retried. The order row is a
 *      ghost until it's paid or expires — the Partner Orders
 *      query filters unpaid ones out.
 */

async function readFormOrQuery(req: NextRequest): Promise<URLSearchParams> {
  if (req.method === "GET") return req.nextUrl.searchParams;
  try {
    const form = await req.formData();
    const params = new URLSearchParams();
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") params.set(k, v);
    }
    return params;
  } catch {
    return new URLSearchParams();
  }
}

function redirect(req: NextRequest, dest: string): NextResponse {
  const url = new URL(dest, req.url);
  return NextResponse.redirect(url, { status: 303 });
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const params = await readFormOrQuery(req);
  const tranId = params.get("tran_id")?.trim() ?? "";
  const valId = params.get("val_id")?.trim() ?? "";

  if (!tranId) {
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent("Payment failed — please retry")}`,
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: tranId },
    select: { id: true, status: true, paymentGatewayStatus: true },
  });
  if (!order) {
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent("Order not found")}`,
    );
  }

  // Already paid (e.g. a stale fail redirect after IPN confirmed).
  if (order.paymentGatewayStatus === "PAID") {
    return redirect(req, `/orders/${order.id}/track?paid=1`);
  }

  // Validate before discarding — a fail_url bounce can happen after
  // the bank actually approved the charge.
  if (valId) {
    let validation;
    try {
      validation = await validateTransaction(valId);
    } catch {
      validation = null;
    }
    if (
      validation &&
      (validation.status === "VALID" || validation.status === "VALIDATED")
    ) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          // Bug 1 — same fix as success route: only record the
          // gateway confirmation, never auto-promote Order.status.
          // The partner must still accept the order themselves.
          paymentGatewayStatus: "PAID",
          gatewayTransactionId: validation.bank_tran_id ?? valId,
          gatewaySessionKey: null,
        },
      });
      return redirect(req, `/orders/${order.id}/track?paid=1`);
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentGatewayStatus: "FAILED" },
  });

  return redirect(
    req,
    `/checkout?error=${encodeURIComponent(
      "Payment failed — please try again",
    )}&orderId=${encodeURIComponent(order.id)}`,
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}