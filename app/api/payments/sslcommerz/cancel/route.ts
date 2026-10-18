import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET|POST /api/payments/sslcommerz/cancel
 *
 * Phase 2 (browser path) — SSLCommerz redirects here when the
 * customer clicks "Cancel" / closes the payment page.
 *
 * Unlike `fail`, we do NOT go hunting for a valid payment here: a
 * cancel is an explicit user intent to abort. We only flip the
 * gateway status to CANCELLED and bounce them back to /checkout so
 * they can retry. Order.status is untouched (stays PENDING); the
 * Partner Orders query hides unpaid orders so this ghost row never
 * reaches the kitchen.
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

  if (!tranId) {
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent("Payment was cancelled")}`,
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: tranId },
    select: { id: true, paymentGatewayStatus: true },
  });

  if (!order) {
    return redirect(
      req,
      `/checkout?error=${encodeURIComponent("Order not found")}`,
    );
  }

  // If the payment actually landed (IPN raced ahead of this redirect)
  // don't overwrite PAID with CANCELLED.
  if (order.paymentGatewayStatus !== "PAID") {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentGatewayStatus: "CANCELLED" },
    });
  }

  return redirect(
    req,
    `/checkout?error=${encodeURIComponent(
      "Payment was cancelled — you can retry",
    )}&orderId=${encodeURIComponent(order.id)}`,
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}