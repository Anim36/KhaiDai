import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  orderStatusForApi,
  orderStatusLabel,
  type OrderStatusApi,
} from "@/lib/orders";

/**
 * GET /api/admin/orders/[id]
 *
 * ADMIN-only. Returns the full order record (items, status, all three
 * actors) so the `/admin/orders` detail modal can show the same view
 * as the partner dashboard would.
 */

type AdminOrderDetail = {
  id: string;
  shortId: string;
  status: OrderStatusApi;
  statusLabel: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  discountAmount: number;
  promoCode: string | null;
  paymentMethod: string;
  /** ধাপ ৪ — SSLCommerz gateway state at the time the admin opened
   *  this record. Lets support spot a stranded payment instantly. */
  paymentGatewayStatus:
    | "NOT_INITIATED"
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "CANCELLED";
  /** ধাপ ৪ — the bank/val-id SSLCommerz returned once the payment
   *  was validated. Null for COD and for every unconfirmed gateway
   *  order. This is the reference to quote to SSLCommerz support. */
  gatewayTransactionId: string | null;
  deliveryAddress: string;
  placedAt: string;
  customer: { id: string; name: string; email: string; phone: string | null };
  restaurant: {
    id: string;
    name: string;
    address: string;
    cuisine: string;
  };
  rider: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  items: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    price: number;
    lineTotal: number;
  }>;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const row = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        restaurant: {
          select: { id: true, name: true, address: true, cuisine: true },
        },
        rider: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    const api = orderStatusForApi(row.status) as OrderStatusApi;
    const subtotal = row.items.reduce(
      (s, it) => s + it.price * it.quantity,
      0,
    );

    const detail: AdminOrderDetail = {
      id: row.id,
      shortId: `#KD-${row.id.slice(-6).toUpperCase()}`,
      status: api,
      statusLabel: orderStatusLabel[api],
      total: row.total,
      subtotal,
      deliveryFee: row.deliveryFee,
      tax: row.tax,
      discountAmount: row.discountAmount ?? 0,
      promoCode: row.promoCode ?? null,
      paymentMethod: row.paymentMethod,
      paymentGatewayStatus: row.paymentGatewayStatus,
      gatewayTransactionId: row.gatewayTransactionId ?? null,
      deliveryAddress: row.deliveryAddress,
      placedAt: row.createdAt.toISOString(),
      customer: {
        id: row.customer.id,
        name: row.customer.name,
        email: row.customer.email,
        phone: row.customer.phone,
      },
      restaurant: {
        id: row.restaurant.id,
        name: row.restaurant.name,
        address: row.restaurant.address,
        cuisine: row.restaurant.cuisine,
      },
      rider: row.rider
        ? {
            id: row.rider.id,
            name: row.rider.name,
            phone: row.rider.phone,
          }
        : null,
      items: row.items.map((it) => ({
        menuItemId: it.menuItemId,
        name: it.menuItem?.name ?? "Item",
        qty: it.quantity,
        price: it.price,
        lineTotal: it.price * it.quantity,
      })),
    };

    return NextResponse.json({ order: detail }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load order",
      },
      { status: 500 },
    );
  }
}
