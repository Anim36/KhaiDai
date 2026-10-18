import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  orderStatusForApi,
  orderStatusLabel,
  type OrderStatusApi,
} from "@/lib/orders";

/**
 * GET /api/admin/orders
 *
 * ADMIN-only platform-wide order list for /admin/orders.
 *
 * Query params:
 *   • `status`     one of the 8 OrderStatus values (API lowercase)
 *   • `from`       ISO date — inclusive lower bound on createdAt
 *   • `to`         ISO date — inclusive upper bound on createdAt
 *   • `q`          search by customer / restaurant / order id
 *   • `page`       1-based, default 1
 *   • `pageSize`   default 25, capped at 100
 *
 * Response:
 *   {
 *     orders:  AdminOrderRow[],
 *     total:   number,
 *     page:    number,
 *     pageSize: number,
 *   }
 */

const ORDER_STATUS_VALUES: ReadonlyArray<OrderStatusApi> = [
  "pending",
  "preparing",
  "ready",
  "offered_to_rider",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
];

type AdminOrderRow = {
  id: string;
  shortId: string;
  status: OrderStatusApi;
  statusLabel: string;
  total: number;
  customerName: string;
  restaurantName: string;
  /** ধাপ ৪ — payment method chosen at checkout. */
  paymentMethod: "CASH" | "BKASH" | "NAGAD" | "CARD";
  /** ধাপ ৪ — SSLCommerz gateway state. Lets an admin spot a
   *  stranded / failed payment without opening the raw row. */
  paymentGatewayStatus:
    | "NOT_INITIATED"
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "CANCELLED";
  /** ধাপ ৪ — SSLCommerz bank/val-id, null unless the payment was
   *  confirmed PAID. This is the reference an admin quotes to
   *  SSLCommerz support when reconciling a transaction. */
  gatewayTransactionId: string | null;
  riderName: string | null;
  placedAt: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "";
  const fromParam = url.searchParams.get("from") ?? "";
  const toParam = url.searchParams.get("to") ?? "";
  const qParam = url.searchParams.get("q")?.trim() ?? "";
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "25");

  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Math.min(
    100,
    Math.max(1, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 25),
  );

  const where: Record<string, unknown> = {};
  if (
    statusParam.length > 0 &&
    (ORDER_STATUS_VALUES as readonly string[]).includes(statusParam)
  ) {
    // Map API status back to the SCREAMING_SNAKE DB enum.
    where.status = statusParam.toUpperCase();
  }

  const createdAt: Record<string, Date> = {};
  if (fromParam) {
    const d = new Date(fromParam);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (toParam) {
    const d = new Date(toParam);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

  if (qParam.length > 0) {
    where.OR = [
      { id: { contains: qParam } },
      { customer: { is: { name: { contains: qParam, mode: "insensitive" } } } },
      { restaurant: { is: { name: { contains: qParam, mode: "insensitive" } } } },
    ];
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          total: true,
          createdAt: true,
          paymentMethod: true,
          paymentGatewayStatus: true,
          gatewayTransactionId: true,
          customer: { select: { name: true } },
          restaurant: { select: { name: true } },
          rider: { select: { name: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const orders: AdminOrderRow[] = rows.map((o) => {
      const api = orderStatusForApi(o.status) as OrderStatusApi;
      return {
        id: o.id,
        // Short id mirrors what the partner dashboard surfaces
        // ("#KD-xxxx"). The first 6 chars of the cuid make a
        // stable-enough visual key for the table.
        shortId: `#KD-${o.id.slice(-6).toUpperCase()}`,
        status: api,
        statusLabel: orderStatusLabel[api],
        total: o.total,
        customerName: o.customer?.name ?? "Customer",
        restaurantName: o.restaurant?.name ?? "Restaurant",
        riderName: o.rider?.name ?? null,
        paymentMethod: o.paymentMethod,
        paymentGatewayStatus: o.paymentGatewayStatus,
        gatewayTransactionId: o.gatewayTransactionId ?? null,
        placedAt: o.createdAt.toISOString(),
      };
    });

    return NextResponse.json(
      { orders, total, page, pageSize },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list orders",
      },
      { status: 500 },
    );
  }
}
