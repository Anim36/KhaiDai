import { prisma } from "@/lib/prisma";

/**
 * Shape a Favorite row (with its joined restaurant) into the wire
 * format the client expects. Used by both:
 *
 *   • /api/favorites              (POST: add via body restaurantId)
 *   • /api/favorites/[restaurantId] (POST: add via path param)
 *
 * Centralised so both endpoints always return the same payload —
 * never let one drift from the other.
 *
 * The restaurant's `rating` field on the row is the seeded /
 * partner-set value. We recompute the live average from real
 * customer reviews so the heart button on the card and the
 * "My Favorites" tab both surface the same number.
 */
export function shapeFavorite(f: {
  id: string;
  restaurantId: string;
  createdAt: Date;
  restaurant: {
    id: string;
    name: string;
    cuisine: string;
    coverImage: string | null;
    rating: number;
    deliveryTime: number;
    deliveryFee: number;
    reviews?: Array<{ rating: number }>;
  };
}) {
  const revs = f.restaurant.reviews ?? [];
  let avg: number = f.restaurant.rating;
  if (revs.length > 0) {
    let s = 0;
    for (const r of revs) s += r.rating;
    avg = s / revs.length;
  }
  return {
    id: f.id,
    restaurantId: f.restaurantId,
    createdAt: f.createdAt.toISOString(),
    restaurant: {
      id: f.restaurant.id,
      name: f.restaurant.name,
      cuisine: f.restaurant.cuisine,
      coverImage: f.restaurant.coverImage,
      rating: avg,
      deliveryTime: f.restaurant.deliveryTime,
      deliveryFee: f.restaurant.deliveryFee,
    },
  };
}

/**
 * Prisma `include` clause for a Favorite row that pulls the joined
 * restaurant + live review ratings. Used by both POST endpoints so
 * the response shape stays identical regardless of how the heart
 * was added.
 */
export const favoriteWithRestaurantInclude = {
  restaurant: {
    select: {
      id: true,
      name: true,
      cuisine: true,
      coverImage: true,
      rating: true,
      deliveryTime: true,
      deliveryFee: true,
      reviews: {
        where: { kind: "RESTAURANT" as const },
        select: { rating: true },
      },
    },
  },
} as const;

/**
 * Upsert a Favorite for (userId, restaurantId). Idempotent —
 * re-favoriting the same restaurant returns the existing row
 * instead of erroring. Returns null when the restaurant doesn't
 * exist (caller decides the 404 response).
 */
export async function upsertFavorite(
  userId: string,
  restaurantId: string,
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true },
  });
  if (!restaurant) return null;

  return prisma.favorite.upsert({
    where: {
      userId_restaurantId: {
        userId,
        restaurantId,
      },
    },
    create: { userId, restaurantId },
    update: {},
    include: favoriteWithRestaurantInclude,
  });
}
