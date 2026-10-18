import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * POST /api/restaurants/status
 *
 * কাজ ২ — Toggle the partner's "Accepting Orders" flag for the
 * restaurant they own. Mirrors `/api/riders/status` but simpler:
 *
 *   • Body: { online: boolean }.
 *   • Updates `Restaurant.isAcceptingOrders` and writes a
 *     `RestaurantOnlineSession` row for every ON interval so the
 *     partner dashboard can later show "Today's Active Hours".
 *   • An explicit `online: false` always closes any pre-existing
 *     open session. We don't heartbeat (restaurants don't move),
 *     so a forgotten open session only affects the partner's own
 *     hours counter — not a customer-facing surface.
 *   • Suspended restaurants can be flipped to either side without
 *     4xx — suspension is enforced elsewhere (POST /api/orders).
 *
 * Responses:
 *   200 { isAcceptingOrders: boolean }
 *   400 missing/invalid online flag
 *   401 missing / invalid token
 *   403 wrong role
 *   404 partner has no restaurant yet
 *   500 server error
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
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
  const { online } = body as { online?: unknown };
  if (typeof online !== "boolean") {
    return NextResponse.json(
      { error: "online must be a boolean" },
      { status: 400 },
    );
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: "Create your restaurant before toggling its status." },
      { status: 404 },
    );
  }

  try {
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.restaurant.update({
        where: { id: restaurant.id },
        data: { isAcceptingOrders: online },
        select: { id: true, isAcceptingOrders: true },
      });

      if (online) {
        // Defensive: close any lingering open session (shouldn't
        // happen in practice, but a previous crash might have left
        // one open).
        await tx.restaurantOnlineSession.updateMany({
          where: { restaurantId: restaurant.id, endedAt: null },
          data: { endedAt: now },
        });
        await tx.restaurantOnlineSession.create({
          data: {
            restaurantId: restaurant.id,
            startedAt: now,
            lastSeenAt: now,
          },
        });
      } else {
        await tx.restaurantOnlineSession.updateMany({
          where: { restaurantId: restaurant.id, endedAt: null },
          data: { endedAt: now },
        });
      }
      return next;
    });

    return NextResponse.json(
      { isAcceptingOrders: updated.isAcceptingOrders },
      { status: 200 },
    );
  } catch (err) {
    console.error("restaurants/status failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update restaurant status",
      },
      { status: 500 },
    );
  }
}
