import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateDistance } from "@/lib/geo";

/**
 * GET /api/search?q=&lat=&lng=&limit=
 *
 * Unified navbar search across restaurants AND dishes.
 *
 * Query params:
 *   q     (required) — user input. We trim + case-fold before
 *                     searching. 2-60 character guard so a stray
 *                     empty/whitespace query can't run an unbounded
 *                     ILIKE.
 *   lat   (optional) — customer pin latitude
 *   lng   (optional) — customer pin longitude
 *   limit (optional, default 20, cap 50) — total cap on combined
 *                     matched restaurants + matched dishes.
 *
 * Behaviour:
 *   • Restaurants are matched on `name` OR `cuisine` (case-insensitive
 *     partial, Prisma's `mode: 'insensitive'` translates to ILIKE).
 *   • Dishes are matched on `name` only (we don't want every dish
 *     whose description mentions "chicken" to surface — too noisy).
 *     Each dish row carries the parent restaurant's id + name so the
 *     dropdown can show "Biryani · Kacchi Bhai".
 *   • When `lat=&lng=` are present, BOTH sides are filtered through
 *     the same 5 km radius the listing endpoint uses (see
 *     `DEFAULT_MAX_DISTANCE_KM` below).
 *   • When lat/lng are missing — guest browse, navbar fired without
 *     an address picked — we return the unfiltered match set so the
 *     dropdown isn't blank.
 *
 * Response:
 *   200 {
 *     matchedRestaurants: SearchRestaurantDto[];
 *     matchedDishes:      SearchDishDto[];
 *     scoped:             boolean;
 *   }
 *
 * We intentionally keep this endpoint public (no auth gate) — the
 * navbar dropdown runs on every page including the landing page,
 * where most users haven't signed in yet.
 */

const DEFAULT_MAX_DISTANCE_KM = 5;

type SearchRestaurantDto = {
  id: string;
  name: string;
  cuisine: string;
  image: string;
  /** Set only when `lat=&lng=` was provided — distance from pin in km. */
  distanceKm?: number;
};

type SearchDishDto = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  category: string;
  popular: boolean;
  restaurantId: string;
  restaurantName: string;
  /** Same distance caveat as the restaurant DTO. */
  distanceKm?: number;
};

function parseLatLng(url: URL): { lat: number; lng: number } | null {
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  if (!latRaw || !lngRaw) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const origin = parseLatLng(url);
    const scoped = origin !== null;
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
      50,
    );

    // Guard the empty + overlong queries so the ILIKE doesn't run on
    // whitespace or a copy-pasted essay. We return an empty payload
    // (instead of 400) so the navbar dropdown just renders "no
    // matches" without an error pill — a 400 would look like a bug.
    if (q.length < 2) {
      return NextResponse.json(
        { matchedRestaurants: [], matchedDishes: [], scoped },
        { status: 200 },
      );
    }
    if (q.length > 60) {
      return NextResponse.json(
        { matchedRestaurants: [], matchedDishes: [], scoped },
        { status: 200 },
      );
    }

    // ----------------------------------------------------------------
    // 1. Restaurant matches — name OR cuisine. Soft-deleted rows
    //    never surface in search (no point showing a restaurant
    //    customers can't order from).
    // ----------------------------------------------------------------
    const restaurantsRaw = await prisma.restaurant.findMany({
      where: {
        // ধাপ ৪ — only APPROVED restaurants surface in customer search;
        // PENDING / REJECTED rows are admin-only and never hit the
        // customer's search bar.
        deletedAt: null,
        verificationStatus: "APPROVED",
        isSuspended: false,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { cuisine: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        cuisine: true,
        coverImage: true,
        latitude: true,
        longitude: true,
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const restaurants: SearchRestaurantDto[] = [];
    for (const r of restaurantsRaw) {
      let distanceKm: number | undefined;
      if (origin) {
        if (typeof r.latitude !== "number" || typeof r.longitude !== "number") {
          // No pin set — exclude when the caller asked for scoped
          // results. They can't order from a restaurant without a
          // delivery area.
          continue;
        }
        const d = calculateDistance(
          origin.lat,
          origin.lng,
          r.latitude,
          r.longitude,
        );
        if (!Number.isFinite(d)) continue;
        if (d > DEFAULT_MAX_DISTANCE_KM) continue;
        distanceKm = d;
      }
      restaurants.push({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        image: r.coverImage ?? "",
        distanceKm,
      });
    }

    // ----------------------------------------------------------------
    // 2. Dish matches — joined to restaurant. We filter by
    //    `available: true` and `restaurant.deletedAt IS NULL` so
    //    hidden / restaurant-removed dishes never surface.
    // ----------------------------------------------------------------
    const dishesRaw = await prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        available: true,
        name: { contains: q, mode: "insensitive" },
        restaurant: { deletedAt: null },
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        image: true,
        category: true,
        popular: true,
        restaurantId: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const dishes: SearchDishDto[] = [];
    for (const d of dishesRaw) {
      let distanceKm: number | undefined;
      if (origin) {
        if (
          typeof d.restaurant.latitude !== "number" ||
          typeof d.restaurant.longitude !== "number"
        ) {
          continue;
        }
        const dist = calculateDistance(
          origin.lat,
          origin.lng,
          d.restaurant.latitude,
          d.restaurant.longitude,
        );
        if (!Number.isFinite(dist)) continue;
        if (dist > DEFAULT_MAX_DISTANCE_KM) continue;
        distanceKm = dist;
      }
      dishes.push({
        id: d.id,
        name: d.name,
        description: d.description ?? null,
        price: d.price,
        image: d.image ?? null,
        category: d.category,
        popular: d.popular,
        restaurantId: d.restaurantId,
        restaurantName: d.restaurant.name,
        distanceKm,
      });
    }

    return NextResponse.json(
      {
        matchedRestaurants: restaurants,
        matchedDishes: dishes,
        scoped,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Search failed",
      },
      { status: 500 },
    );
  }
}
