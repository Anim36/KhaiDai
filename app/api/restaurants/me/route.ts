import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  restaurantToDetail,
  restaurantToListing,
} from "@/lib/restaurants";
import { getRestaurantOnlineSecondsForDay } from "@/lib/restaurant-hours";

/**
 * GET /api/restaurants/me
 *
 * Returns the signed-in PARTNER's own restaurant (with its menu
 * items) in the **detail** shape so a single endpoint powers both
 * the Partner Dashboard header and the Menu Management page.
 *
 *   200 { restaurant: RestaurantDetail, listing: ListingRestaurant,
 *         isAcceptingOrders: boolean, onlineSecondsToday: number }
 *   204 no restaurant yet (Partner has not created one — partner
 *       Dashboard treats this as the onboarding state)
 *   401 missing / invalid token
 *   403 wrong role
 *   500 server error
 *
 * Returning 204 instead of a JSON 404 makes it cheap to detect
 * "you don't have a restaurant yet" from the client — a fetch
 * whose response is null means "show the create form".
 *
 * কাজ ২ — the response now carries the restaurant's
 * `isAcceptingOrders` flag plus `onlineSecondsToday` so the
 * partner dashboard can render "Today's Active Hours" alongside
 * the toggle without a second round-trip.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const row = await prisma.restaurant.findFirst({
      where: { ownerId: auth.user.id },
      include: {
        // Feat 1 — load each item's option groups + choices so the
        // Partner Modal can re-seed its options and the Customer
        // Detail page knows whether to prompt for customisation.
        menu: {
          include: {
            options: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              include: {
                choices: {
                  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                },
              },
            },
          },
        },
        reviews: {
          where: { kind: "RESTAURANT" },
          select: { rating: true },
        },
      },
    });
    if (!row) {
      return new NextResponse(null, { status: 204 });
    }
    const onlineSecondsToday = await getRestaurantOnlineSecondsForDay(
      row.id,
      new Date(),
    );
    return NextResponse.json(
      {
        // `restaurantToDetail` carries the menu items grouped by
        // category so the menu-management page can drop the data
        // straight into its local state. We also expose the
        // `listing` shape for header / summary rows.
        restaurant: restaurantToDetail(row),
        listing: await restaurantToListing(row),
        isAcceptingOrders: row.isAcceptingOrders,
        onlineSecondsToday,
        // কাজ ২ — partner-locking flags. The Settings page reads
        // these to know which field groups are currently locked.
        profileNeedsReentry: row.profileNeedsReentry,
        locationNeedsReentry: row.locationNeedsReentry,
        // কাজ ২ — map-pin lat/lng so the AddressPicker can re-seed
        // its pin on next open. The detail mapper deliberately
        // does not carry these (the customer-side detail page has
        // no use for them); we surface them here so the partner
        // Settings page is the only consumer.
        latitude: row.latitude,
        longitude: row.longitude,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load your restaurant" },
      { status: 500 },
    );
  }
}
