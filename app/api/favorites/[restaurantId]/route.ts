import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { shapeFavorite, upsertFavorite } from "@/lib/favorites";

/**
 * /api/favorites/[restaurantId]
 *
 *   POST   — add a restaurant to the signed-in customer's
 *            favorites. The restaurantId comes from the URL so
 *            the heart button can fire a flat
 *            `POST /api/favorites/{id}` without a JSON body.
 *            Idempotent: re-favoriting returns the existing row
 *            with 200 instead of erroring on the unique
 *            (userId, restaurantId) constraint.
 *
 *   DELETE — remove a favorite. Idempotent: if the row never
 *            existed, returns 200 with `{ ok: true }` anyway so
 *            the heart-toggle button doesn't have to distinguish
 *            between "was favorited, now un-favorited" and
 *            "was never favorited".
 *
 *   GET    — convenience: returns `{ isFavorite: boolean }` so the
 *            restaurant card / detail page can prime the heart
 *            state on mount without listing the full favorites
 *            list.
 *
 * Auth: CUSTOMER-only. All handlers scope the lookup by the
 * signed-in user's id so customers can't query, add or delete
 * each other's favorites.
 */

type RouteCtx = { params: { restaurantId: string } };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const restaurantId = ctx.params.restaurantId;
  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required" },
      { status: 400 },
    );
  }
  try {
    const favorite = await upsertFavorite(auth.user.id, restaurantId);
    if (!favorite) {
      return NextResponse.json(
        { error: "Restaurant not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { favorite: shapeFavorite(favorite) },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add favorite" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const restaurantId = ctx.params.restaurantId;
  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required" },
      { status: 400 },
    );
  }
  try {
    await prisma.favorite.deleteMany({
      where: { userId: auth.user.id, restaurantId },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove favorite" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const restaurantId = ctx.params.restaurantId;
  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required" },
      { status: 400 },
    );
  }
  try {
    const row = await prisma.favorite.findUnique({
      where: {
        userId_restaurantId: {
          userId: auth.user.id,
          restaurantId,
        },
      },
      select: { id: true },
    });
    return NextResponse.json(
      { isFavorite: !!row },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load favorite" },
      { status: 500 },
    );
  }
}
