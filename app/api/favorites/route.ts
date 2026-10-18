import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  shapeFavorite,
  favoriteWithRestaurantInclude,
  upsertFavorite,
} from "@/lib/favorites";

/**
 * /api/favorites
 *
 *   GET  — list the signed-in customer's favorited restaurants,
 *          including the joined restaurant row so the client can
 *          render the existing `<RestaurantCard />` without a second
 *          round-trip.
 *
 *   POST — add a restaurant to the signed-in customer's favorites.
 *          Body:
 *            { restaurantId: string }
 *          The Favorite table has a unique (userId, restaurantId)
 *          constraint, so re-favoriting the same restaurant is a
 *          no-op (returns 200 with the existing row instead of 409)
 *          — the heart button never has to special-case duplicates.
 *
 * Auth: CUSTOMER-only.
 */

type CreateBody = { restaurantId?: unknown };

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const rows = await prisma.favorite.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      include: favoriteWithRestaurantInclude,
    });
    return NextResponse.json(
      { favorites: rows.map(shapeFavorite) },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load favorites" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const restaurantId = safeStr(body.restaurantId);
  if (!restaurantId) {
    return NextResponse.json(
      { error: "restaurantId is required." },
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
