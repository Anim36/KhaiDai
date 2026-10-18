import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { restaurantToListing } from "@/lib/restaurants";
import { calculateDistance } from "@/lib/geo";
import { MAX_COVER_DATA_URL_CHARS, MAX_COVER_BYTES_MB } from "@/lib/upload-limits";
import { notSoftDeleted, liveRestaurant } from "@/lib/soft-delete";

/**
 * Maximum delivery distance (km) used by the customer-facing
 * listing. Restaurants whose pin is further than this from the
 * customer's address are filtered out.
 */
const DEFAULT_MAX_DISTANCE_KM = 5;

/**
 * Sort helper — puts restaurants with `isAcceptingOrders === true`
 * (or undefined, treated as "open by default") ahead of offline
 * ones. Stable: restaurants inside either bucket keep their
 * existing order.
 *
 * Bug 3 — the customer-facing grid previously mixed online and
 * offline rows; a closed restaurant near the customer could float
 * to the top of the carousel purely because of distance. Online
 * first is the same ranking Foodpanda uses so the customer
 * always sees open restaurants at the top.
 */
function sortOnlineFirst<
  T extends { isAcceptingOrders?: boolean },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ao = a.isAcceptingOrders === false ? 1 : 0;
    const bo = b.isAcceptingOrders === false ? 1 : 0;
    return ao - bo;
  });
}

/**
 * Parse `?lat=&lng=` query params into a usable pair, or `null`
 * when either value is missing / not finite.
 */
function parseLatLng(url: URL): { lat: number; lng: number } | null {
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  if (!latRaw || !lngRaw) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Sanity-check ranges. Latitude is bounded to ±90°, longitude to
  // ±180°; values outside that almost certainly came from a buggy
  // client and would produce nonsensical distances.
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * GET /api/restaurants
 *
 * Public — returns restaurants in the catalog. Customer homepage,
 * /restaurants, and the listing filter UI all consume this endpoint.
 *
 * Query params:
 *   lat, lng  When BOTH are present, we restrict results to
 *             restaurants within DEFAULT_MAX_DISTANCE_KM (5 km) of
 *             the coordinate, sorted by distance ascending. Each
 *             returned row carries an extra `distanceKm` field.
 *             Restaurants without a saved pin are still returned
 *             (no distance) so a freshly-seeded catalog never goes
 *             blank — the partner onboarding flow updates the pin
 *             over time.
 *
 * Without lat/lng we keep the legacy behavior: every restaurant,
 * newest first.
 *
 * Response: 200 { restaurants: ListingRestaurant[] }
 */
export async function GET(req: NextRequest) {
  try {
    const rows = await prisma.restaurant.findMany({
      where: { ...liveRestaurant() },
      include: {
        menu: true,
        // Pull just the rating field so the listing can compute a
        // real customer-driven average. RIDER reviews on the same
        // order live on the same row but shouldn't roll into the
        // restaurant's star score, so we filter explicitly.
        reviews: {
          where: { kind: "RESTAURANT" },
          select: { rating: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const origin = parseLatLng(new URL(req.url));

    if (!origin) {
      // No pin → no distance-based sort. Apply the
      // online-above-offline ranking so the homepage grid still
      // puts accepting restaurants on top.
      const sorted = sortOnlineFirst(rows);
      const restaurants = await Promise.all(
        sorted.map((r) => restaurantToListing(r)),
      );
      return NextResponse.json({ restaurants }, { status: 200 });
    }

    const maxKm = DEFAULT_MAX_DISTANCE_KM;

    // Compute distance and drop any restaurant that either has no
    // pin (a freshly-seeded row that predates the picker) or sits
    // outside the `maxKm` radius. Per the customer-facing product
    // spec, the list under `?lat=&lng=` should only show what's
    // actually deliverable to that pin — restaurants the rider
    // couldn't reach are noise.
    const enriched = rows
      .map((row) => {
        if (
          typeof row.latitude !== "number" ||
          typeof row.longitude !== "number"
        ) {
          return null;
        }
        const d = calculateDistance(
          origin.lat,
          origin.lng,
          row.latitude,
          row.longitude,
        );
        if (!Number.isFinite(d) || d > maxKm) return null;
        return { row, distanceKm: d };
      })
      .filter(
        (e): e is { row: (typeof rows)[number]; distanceKm: number } =>
          e !== null,
      )
      // Bug 3 — primary key is "are you open now". Distance is the
      // tiebreaker so an online restaurant 4.5 km away still
      // beats an offline one 0.3 km away.
      .sort((a, b) => {
        const ao = a.row.isAcceptingOrders === true ? 0 : 1;
        const bo = b.row.isAcceptingOrders === true ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.distanceKm - b.distanceKm;
      });
    const inRange = await Promise.all(
      enriched.map((e) =>
        restaurantToListing(e.row, { distanceKm: e.distanceKm }),
      ),
    );

    return NextResponse.json({ restaurants: inRange }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list restaurants" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/restaurants
 *
 * Partner-only — creates a brand-new restaurant owned by the
 * currently signed-in PARTNER. One-restaurant-per-partner is
 * enforced here: a partner who already owns a restaurant gets a
 * 409 with a descriptive message instead of a silent overwrite.
 *
 * Body (JSON):
 *   {
 *     name:          string  (2-80 chars, required)
 *     address:       string  (required)
 *     cuisine:       string  (required)
 *     deliveryTime:  number  (minutes, 5-180)
 *     coverImage?:   string  (URL or data URL)
 *     openingHours?: string  (free-form)
 *   }
 *
 * `deliveryFee` is accepted only for backwards compatibility with
 * old clients — the platform now owns the schedule via
 * DeliveryFeeConfig and the value is ignored.
 *
 * ownerId is taken from the JWT — clients cannot pick a different
 * owner, so we don't trust any `ownerId` field in the body even if
 * one is sent.
 *
 * Responses:
 *   201 { restaurant }
 *   400 validation error
 *   401 missing / invalid token
 *   403 wrong role
 *   409 partner already owns a restaurant
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

  const {
    name,
    address,
    cuisine,
    deliveryTime,
    // `deliveryFee` from the body is intentionally IGNORED. The
    // platform controls the fee schedule via DeliveryFeeConfig.
    // We accept the field only so older clients keep sending and
    // we don't have a payload mismatch in the validation error.
    deliveryFee: _ignoredDeliveryFee,
    coverImage,
    openingHours,
    latitude,
    longitude,
  } = body as Record<string, unknown>;

  // ---- validation --------------------------------------------------
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "name must be 2-80 characters" },
      { status: 400 },
    );
  }
  if (typeof address !== "string" || address.trim().length < 4) {
    return NextResponse.json(
      { error: "address is required" },
      { status: 400 },
    );
  }
  if (typeof cuisine !== "string" || cuisine.trim().length < 2) {
    return NextResponse.json(
      { error: "cuisine is required" },
      { status: 400 },
    );
  }
  if (
    typeof deliveryTime !== "number" ||
    !Number.isFinite(deliveryTime) ||
    deliveryTime < 5 ||
    deliveryTime > 180
  ) {
    return NextResponse.json(
      { error: "deliveryTime must be 5-180 minutes" },
      { status: 400 },
    );
  }

  // Latitude / longitude are optional on POST — but if a partner
  // supplies them they must be finite numbers in the valid ranges,
  // otherwise we'd corrupt the listing's distance sort.
  let normalisedLat: number | null = null;
  let normalisedLng: number | null = null;
  if (latitude !== undefined && latitude !== null) {
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return NextResponse.json(
        { error: "latitude must be a finite number between -90 and 90" },
        { status: 400 },
      );
    }
    normalisedLat = latitude;
  }
  if (longitude !== undefined && longitude !== null) {
    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: "longitude must be a finite number between -180 and 180" },
        { status: 400 },
      );
    }
    normalisedLng = longitude;
  }
  if (
    (normalisedLat === null) !== (normalisedLng === null)
  ) {
    // The map picker always emits both; accepting one without the
    // other would lead to asymmetric records.
    return NextResponse.json(
      { error: "latitude and longitude must be sent together" },
      { status: 400 },
    );
  }

  let normalisedCover: string | null = null;
  if (coverImage !== undefined && coverImage !== null) {
    if (
      typeof coverImage !== "string" ||
      coverImage.length > MAX_COVER_DATA_URL_CHARS
    ) {
      return NextResponse.json(
        {
          error: `coverImage must be a data-URL string up to ${MAX_COVER_BYTES_MB} MB`,
        },
        { status: 400 },
      );
    }
    normalisedCover = coverImage.trim() || null;
  }

  let normalisedHours = "";
  if (openingHours !== undefined && openingHours !== null) {
    if (typeof openingHours !== "string" || openingHours.length > 200) {
      return NextResponse.json(
        { error: "openingHours must be a string up to 200 chars" },
        { status: 400 },
      );
    }
    normalisedHours = openingHours.trim();
  }

  // ---- one restaurant per partner ---------------------------------
  const existing = await prisma.restaurant.findFirst({
    where: { ...notSoftDeleted(), ownerId: auth.user.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a restaurant" },
      { status: 409 },
    );
  }

  try {
    const created = await prisma.restaurant.create({
      data: {
        name: name.trim(),
        ownerId: auth.user.id,
        address: address.trim(),
        cuisine: cuisine.trim(),
        deliveryTime,
        // deliveryFee is platform-controlled; fall back to 0 if
        // not provided. Stored column is deprecated — see
        // schema.prisma comment.
        deliveryFee: 0,
        coverImage: normalisedCover,
        openingHours: normalisedHours,
        latitude: normalisedLat,
        longitude: normalisedLng,
      },
      include: { menu: true },
    });
    return NextResponse.json(
      { restaurant: await restaurantToListing(created) },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create restaurant" },
      { status: 500 },
    );
  }
}
