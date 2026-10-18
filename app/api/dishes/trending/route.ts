import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateDistance } from "@/lib/geo";

/**
 * GET /api/dishes/trending
 *
 * Returns the dishes that have been ordered the most so the
 * homepage "Top Trending Dishes" carousel + the /dishes grid can
 * surface real, database-driven data instead of hardcoded mocks.
 *
 * Algorithm:
 *   1. Optional `?lat=&lng=` — the customer's selected delivery
 *      pin. When present, the leaderboard is restricted to dishes
 *      belonging to restaurants within DEFAULT_MAX_DISTANCE_KM (5
 *      km) of the pin, matching the radius the listing endpoint
 *      already uses. Restaurants that don't have a saved lat/lng
 *      are dropped on this pass; they aren't deliverable yet.
 *      When lat/lng are absent — guest browse, picked from the
 *      navbar without an address, etc. — we keep the legacy
 *      "everything" behavior so the section is never blank.
 *   2. Aggregate `OrderItem.quantity` per `menuItemId`, restricted
 *      to `Order.status IN (DELIVERED)`. Cancelled or in-flight
 *      orders can't pollute the leaderboard.
 *   3. Sort descending by total quantity, take the top N (default
 *      12 — homepage carousel slices off the first 4 from this).
 *   4. Hydrate with menu + restaurant info (id, name, image…).
 *
 * Empty leaderboard fallback (no DELIVERED orders OR no in-range
 * restaurant ordering anything) — surface the most recently added
 * menu items, filtered by the same 5 km radius when a pin is
 * present. This keeps the section populated for fresh
 * neighbourhoods where nothing has been ordered yet.
 *
 * Response:
 *   200 {
 *     dishes: Array<{
 *       id: string;
 *       name: string;
 *       price: number;
 *       image: string | null;
 *       description: string | null;
 *       category: string;
 *       popular: boolean;
 *       restaurantId: string;
 *       restaurantName: string;
 *       orderCount: number;
 *       trending: boolean;
 *     }>;
 *     scoped: boolean;   // true when ?lat=&lng= was honoured
 *   }
 */

const DEFAULT_LIMIT = 12;
// Same radius as /api/restaurants — keep this in sync with the
// list endpoint so the trending carousel never proposes dishes from
// kitchens the customer can't actually order from.
const DEFAULT_MAX_DISTANCE_KM = 5;

const COUNTED_STATUSES = ["DELIVERED"] as const;

/** Parse the lat/lng pair from the URL, or null when missing. */
function parseLatLng(url: URL): { lat: number; lng: number } | null {
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  if (!latRaw || !lngRaw) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Defensive range check — bogus coordinates would silently zero
  // out everything within Haversine math.
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Filter a list of `Restaurant` rows down to those whose saved pin
 * sits within `maxKm` of `origin`. Restaurants without a saved
 * latitude/longitude are dropped — they're freshly-seeded rows the
 * partner hasn't pinned yet and aren't orderable.
 */
function restaurantsWithinRadius<
  T extends { latitude: number | null; longitude: number | null },
>(rows: T[], origin: { lat: number; lng: number }, maxKm: number): Array<T & { distanceKm: number }> {
  return rows
    .map((row) => {
      if (typeof row.latitude !== "number" || typeof row.longitude !== "number") {
        return null;
      }
      const d = calculateDistance(
        origin.lat,
        origin.lng,
        row.latitude,
        row.longitude,
      );
      if (!Number.isFinite(d) || d > maxKm) return null;
      return { ...row, distanceKm: d };
    })
    .filter((e): e is T & { distanceKm: number } => e !== null);
}

/** Project a MenuItem row into the API response shape. */
function projectItem(
  it: {
    id: string;
    name: string;
    price: number;
    image: string | null;
    description: string | null;
    category: string;
    popular: boolean;
    restaurantId: string;
    restaurant: { name: string };
  },
  orderCount: number,
  trending: boolean,
) {
  return {
    id: it.id,
    name: it.name,
    price: it.price,
    image: it.image,
    description: it.description,
    category: it.category,
    popular: it.popular,
    restaurantId: it.restaurantId,
    restaurantName: it.restaurant.name,
    orderCount,
    trending,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      Math.max(
        parseInt(limitParam ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT,
        1,
      ),
      50,
    );

    const origin = parseLatLng(url);
    const scoped = origin !== null;

    // ----------------------------------------------------------------
    // 1. Pull every restaurant's pin in one query and narrow the
    //    candidate set to the in-range restaurants. Doing this first
    //    means the SQL `menuItem.restaurantId IN (...)` filter below
    //    walks a small set instead of every dish in the catalogue.
    //    Soft-deleted restaurants are excluded — their dishes aren't
    //    orderable.
    // ----------------------------------------------------------------
    const allRestaurants = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        // ধাপ ৪ — keep PENDING/REJECTED restaurants off the
        // customer's trending feed.
        verificationStatus: "APPROVED",
        isSuspended: false,
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
      },
    });

    const candidates = origin
      ? new Set(
          restaurantsWithinRadius(
            allRestaurants,
            origin,
            DEFAULT_MAX_DISTANCE_KM,
          ).map((r) => r.id),
        )
      : null;

    // ----------------------------------------------------------------
    // 2. Pull the order leaderboard. When scoped we add
    //    `menuItem.restaurantId IN candidates`. When the in-range set
    //    is empty we skip the aggregation entirely so the SQL doesn't
    //    run pointlessly (we know there's no result).
    // ----------------------------------------------------------------
    let grouped:
      | Array<{ menuItemId: string; _sum: { quantity: number | null } }>
      | null = null;
    if (candidates && candidates.size === 0 && origin) {
      grouped = [];
    } else {
      grouped = await prisma.orderItem.groupBy({
        by: ["menuItemId"],
        where: {
          order: { status: { in: [...COUNTED_STATUSES] } },
          ...(candidates
            ? { menuItem: { restaurantId: { in: [...candidates] } } }
            : {}),
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: limit,
      });
    }

    if (grouped && grouped.length > 0) {
      const menuIds = grouped.map((g) => g.menuItemId);
      const items = await prisma.menuItem.findMany({
        // Soft-delete filter applies to both the menu item itself and
        // its parent restaurant — a dish from a soft-deleted
        // restaurant isn't orderable.
        where: {
          deletedAt: null,
          id: { in: menuIds },
          restaurant: { deletedAt: null },
        },
        include: { restaurant: { select: { id: true, name: true } } },
      });
      const byId = new Map(items.map((it) => [it.id, it]));
      const dishes = grouped
        .map((g) => {
          const it = byId.get(g.menuItemId);
          if (!it) return null;
          return projectItem(it, g._sum.quantity ?? 0, true);
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      return NextResponse.json({ dishes, scoped }, { status: 200 });
    }

    // ----------------------------------------------------------------
    // 3. Fallback path — no DELIVERED orders OR none in range. Show
    //    the most recently added available menu items, also limited
    //    to in-range restaurants when a pin was provided so an
    //    empty result means "no nearby kitchens" rather than "the DB
    //    has nothing".
    // ----------------------------------------------------------------
    const fallbackWhere = {
      deletedAt: null,
      available: true,
      ...(candidates
        ? { restaurantId: { in: [...candidates] } }
        : {}),
      restaurant: { deletedAt: null },
    };

    const fallback = await prisma.menuItem.findMany({
      where: fallbackWhere,
      include: { restaurant: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const dishes = fallback.map((it) => projectItem(it, 0, false));

    return NextResponse.json({ dishes, scoped }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load trending dishes",
      },
      { status: 500 },
    );
  }
}
