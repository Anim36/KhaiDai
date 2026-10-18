import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTransaction } from "@/lib/sslcommerz";

/**
 * POST /api/payments/sslcommerz/ipn
 *
 * Phase 2 (server path) — SSLCommerz's Instant Payment
 * Notification. This is a direct server-to-server POST from the
 * gateway to our backend; the customer's browser is not involved.
 *
 * Why it exists: the `success_url` redirect only fires if the
 * customer keeps their browser open through the whole flow. If
 * they close the tab, close the app, or lose network mid-redirect,
 * the success callback never reaches us and the order would sit
 * unpaid forever even though money was captured. IPN is the
 * guaranteed delivery channel for that case.
 *
 * Same security contract as `success`: we never trust the IPN
 * body's `status` field — we re-validate val_id against
 * SSLCommerz server-to-server before writing PAID.
 *
 * No auth: the caller is SSLCommerz, not a logged-in user. The
 * store-password-scoped validation call is what authenticates
 * the transaction; anyone hitting this endpoint without a valid
 * val_id can't move an order to PAID.
 *
 * Responses: always 200 (even on failure) so the gateway doesn't
 * retry a request we'll never fulfil. The console log carries the
 * diagnostic detail.
 */
export async function POST(req: NextRequest) {
  // SSLCommerz posts a form body. Read it defensively — if parsing
  // fails we can't do anything useful, so acknowledge and bail.
  let form: URLSearchParams;
  try {
    const fd = await req.formData();
    form = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") form.set(k, v);
    }
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const valId = form.get("val_id")?.trim() ?? "";
  const tranId = form.get("tran_id")?.trim() ?? "";

  if (!valId || !tranId) {
    console.warn(
      "[/api/payments/sslcommerz/ipn] missing val_id or tran_id — ignoring",
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const order = await prisma.order.findUnique({
    where: { id: tranId },
    select: { id: true, status: true, paymentGatewayStatus: true },
  });
  if (!order) {
    console.warn(
      `[/api/payments/sslcommerz/ipn] no order for tran_id=${tranId}`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Idempotent — IPN can be retried by the gateway. If we already
  // recorded PAID, this is a duplicate; acknowledge and stop.
  if (order.paymentGatewayStatus === "PAID") {
    return NextResponse.json({ received: true, alreadyPaid: true }, { status: 200 });
  }

  // Re-validate server-to-server. Never trust the IPN body status.
  let validation;
  try {
    validation = await validateTransaction(valId);
  } catch (err) {
    console.error("[/api/payments/sslcommerz/ipn] validation threw", err);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const ok =
    validation.status === "VALID" || validation.status === "VALIDATED";

  if (!ok) {
    // The IPN may be a genuine failure notification. Mark FAILED so
    // the admin/support view is accurate, but never touch a PAID
    // order (already handled above).
    await prisma.order
      .update({
        where: { id: order.id },
        data: { paymentGatewayStatus: "FAILED" },
      })
      .catch((err) =>
        console.error(
          `[/api/payments/sslcommerz/ipn] failed to mark order ${order.id} FAILED`,
          err,
        ),
      );
    console.warn(
      `[/api/payments/sslcommerz/ipn] validation ${validation.status} for order ${order.id}`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Confirmed paid. Advance order + gateway fields.
  //   • paymentGatewayStatus → PAID + paidAt timestamp.
  //   • Auto-promote a freshly placed online order from PENDING to
  //     PREPARING so the partner dashboard surfaces it without an
  //     extra click. Never rewind a later state (PREPARING/READY/
  //     DISPATCHED/etc all keep their current status).
  //   • gatewayTransactionId is set for support cross-reference.
  try {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentGatewayStatus: "PAID",
        paidAt: new Date(),
        gatewayTransactionId: validation.bank_tran_id ?? valId,
        gatewaySessionKey: null,
        // Promote PENDING (online-paid) → PREPARING. COD orders never
        // hit this path, and any later status is preserved.
        ...(order.status === "PENDING" ? { status: "PREPARING" } : {}),
      },
    });
    console.log(
      `[/api/payments/sslcommerz/ipn] order ${order.id} marked PAID (tran=${validation.bank_tran_id ?? valId}${order.status === "PENDING" ? ", promoted PENDING→PREPARING" : ""})`,
    );
  } catch (err) {
    console.error(
      `[/api/payments/sslcommerz/ipn] failed to persist PAID for order ${order.id}`,
      err,
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}