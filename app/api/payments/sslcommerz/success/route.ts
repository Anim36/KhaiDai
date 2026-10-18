import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTransaction } from "@/lib/sslcommerz";

/**
 * GET|POST /api/payments/sslcommerz/success
 *
 * Phase 2 (browser path) — SSLCommerz redirects the customer's
 * browser here after a successful payment on the gateway page.
 *
 * SECURITY — never trust the redirect. Even though the URL has
 * `?status=VALID&tran_id=...&val_id=...` in it, those are
 * client-supplied and trivially spoofable. We MUST call
 * SSLCommerz's validation API server-to-server before flipping
 * the order to PAID.
 *
 *   1. Read val_id + tran_id from the query (or POST body).
 *   2. Server-to-server validate against SSLCommerz.
 *   3. status === VALID | VALIDATED → PAID, advance Order.status
 *      from PENDING to PREPARING, then redirect the customer to
 *      /orders/[id]/track?paid=1.
 *   4. Otherwise → FAILED, redirect back to /checkout with error.
 *
 * Idempotent: re-arrival on an already-PAID order just sends the
 * user to the tracking page.
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
  const valId = params.get("val_id")?.trim() ?? "";
  const tranId = params.get("tran_id")?.trim() ?? "";

  if (!valId || !tranId) {
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent(
        "Payment confirmation was missing — please retry",
      )}`,
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: tranId },
    select: {
      id: true,
      status: true,
      paymentGatewayStatus: true,
    },
  });
  if (!order) {
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent("Order not found")}`,
    );
  }

  if (order.paymentGatewayStatus === "PAID") {
    return redirect(req, `/orders/${order.id}/track?paid=1`);
  }

  let validation;
  try {
    validation = await validateTransaction(valId);
  } catch (err) {
    console.error(
      "[/api/payments/sslcommerz/success] validation call failed",
      err,
    );
    await prisma.order
      .update({
        where: { id: order.id },
        data: { paymentGatewayStatus: "FAILED" },
      })
      .catch(() => {
        /* main flow still completes */
      });
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent(
        "Payment validation failed — please retry",
      )}`,
    );
  }

  const ok =
    validation.status === "VALID" || validation.status === "VALIDATED";

  if (!ok) {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentGatewayStatus: "FAILED" },
    });
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent(
        `Payment ${validation.status.toLowerCase()} — please retry`,
      )}`,
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      // Bug 1 fix — a freshly paid online order is auto-promoted
      // from PENDING → PREPARING so the partner dashboard surfaces
      // it immediately. The partner can still Accept/Reject from
      // there. Never rewind a later state. paidAt records the
      // gateway-confirmed timestamp for support + analytics.
      paymentGatewayStatus: "PAID",
      paidAt: new Date(),
      gatewayTransactionId: validation.bank_tran_id ?? valId,
      gatewaySessionKey: null,
      ...(order.status === "PENDING" ? { status: "PREPARING" } : {}),
    },
  });

  return redirect(req, `/orders/${order.id}/track?paid=1`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}