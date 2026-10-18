import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

/**
 * Feat 2 — Rider ↔ Customer chat during an active delivery.
 *
 * GET  /api/orders/[id]/messages — returns the chat history for
 *                                    this order, oldest first.
 * POST /api/orders/[id]/messages — append a new message from the
 *                                    caller (customer or assigned
 *                                    rider) and notify the other
 *                                    party.
 *
 * Auth: the requester must be either the customer who placed the
 * order or the assigned rider. No third party — not even ADMIN —
 * can read or post messages.
 *
 * Status gate: chat is enabled once the order has reached
 * `picked_up` (the rider confirmed pickup) and stays enabled until
 * the order becomes `delivered` or `cancelled`. Earlier statuses
 * (preparing, ready, offered_to_rider) refuse writes with a
 * friendly "Chat will be available once the rider picks up your
 * order" so the UI can render a placeholder.
 */
const ACTIVE_CHAT_STATUSES = new Set([
  "picked_up",
  "on_the_way",
]);

const MAX_MESSAGE_CHARS = 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, customerId: true, riderId: true, status: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    const userId = auth.user.id;
    if (order.customerId !== userId && order.riderId !== userId) {
      return NextResponse.json(
        { error: "You don't have access to this chat" },
        { status: 403 },
      );
    }

    const rows = await prisma.orderMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        senderId: true,
        senderRole: true,
        message: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        messages: rows.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderRole: m.senderRole,
          message: m.message,
          createdAt: m.createdAt.toISOString(),
        })),
        // Whether chat is currently enabled. The UI uses this to
        // swap the input box for the placeholder copy on the
        // tracking / delivery pages.
        chatEnabled: ACTIVE_CHAT_STATUSES.has(
          order.status.toLowerCase(),
        ),
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load messages",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const message = (body as Record<string, unknown>).message;
  if (typeof message !== "string") {
    return NextResponse.json(
      { error: "message must be a string" },
      { status: 400 },
    );
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { error: "message cannot be empty" },
      { status: 400 },
    );
  }
  if (trimmed.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `message exceeds ${MAX_MESSAGE_CHARS} characters` },
      { status: 400 },
    );
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, customerId: true, riderId: true, status: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 },
      );
    }

    const userId = auth.user.id;
    if (order.customerId !== userId && order.riderId !== userId) {
      return NextResponse.json(
        { error: "You don't have access to this chat" },
        { status: 403 },
      );
    }

    if (!ACTIVE_CHAT_STATUSES.has(order.status.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            "Chat will be available once the rider picks up your order.",
        },
        { status: 409 },
      );
    }

    const senderRole =
      order.customerId === userId
        ? ("CUSTOMER" as const)
        : ("RIDER" as const);

    const created = await prisma.orderMessage.create({
      data: {
        orderId: order.id,
        senderId: userId,
        senderRole,
        message: trimmed,
      },
      select: {
        id: true,
        senderId: true,
        senderRole: true,
        message: true,
        createdAt: true,
      },
    });

    // Notify the other party. Customer notifications go via the
    // generic helper; rider ones go via createNotification to
    // the bell row.
    const recipientId =
      senderRole === "CUSTOMER" ? order.riderId : order.customerId;
    if (recipientId) {
      try {
        const preview = trimmed.length > 80
          ? `${trimmed.slice(0, 77)}…`
          : trimmed;
        await createNotification(recipientId, {
          title:
            senderRole === "CUSTOMER"
              ? "New message from customer"
              : "New message from rider",
          message: preview,
          type: "ORDER_UPDATE",
          relatedOrderId: order.id,
        });
      } catch (notifErr) {
        // Notification failure isn't fatal for the chat write.
        console.error("order chat notification failed", notifErr);
      }
    }

    return NextResponse.json(
      {
        message: {
          id: created.id,
          senderId: created.senderId,
          senderRole: created.senderRole,
          message: created.message,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to send message",
      },
      { status: 500 },
    );
  }
}