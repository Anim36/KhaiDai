import "dotenv/config";
import type {
  MenuItem as PrismaMenuItem,
  Restaurant as PrismaRestaurant,
} from "@prisma/client";
import { loadActiveDeliveryFeeConfig } from "@/lib/delivery-fee";

/**
 * lib/restaurants.ts — bridges the Prisma schema and the front-end's
 * mock-derived `Restaurant` / `MenuItem` shapes.
 *
 * Why this lives outside the API routes:
 *   • The UI consumes a richer shape than the schema exposes —
 *     `timeMin/timeMax/freeDelivery/priceBucket/promo/reviews` are
 *     computed from a few primitives so we can render the existing
 *     listing / detail pages without a schema migration per tweak.
 *   • Centralising the mapping here means every API route returns
 *     the same shape — no drift between `/api/restaurants`,
 *     `/api/restaurants/[id]`, and `/api/restaurants/me`.
 *   • Real customer reviews live in the `Review` table; this file
 *     projects them onto the public `Restaurant.rating` / `reviews`
 *     fields so the listing cards always surface the latest
 *     numbers without an N+1 round-trip per row.
 */

import type { Restaurant as ListingRestaurant } from "@/data/restaurants";
import type {
  MenuCategory,
  MenuItem as DetailMenuItem,
  RestaurantDetail,
} from "@/data/restaurant-detail";

/**
 * The Prisma `Restaurant` row can come from `findUnique`,
 * `findMany`, or `findFirst`. We accept any shape that has at least
 * the persisted columns and the `owner` / `menu` / `reviews`
 * relations when available — Prisma infers the precise type per
 * query.
 *
 * `reviews` is optional because the listing endpoint historically
 * didn't join the reviews table. Callers that want the real
 * customer-driven rating should pass an aggregate; the helper below
 * falls back to the persisted `rating` column otherwise.
 */
export type RestaurantRow = PrismaRestaurant & {
  menu?: Array<
    PrismaMenuItem & {
      /** Feat 1 — customisation groups. The route includes
       *  `options: { choices: true }`; here we accept the wider
       *  type so `restaurantToDetail` can hand the structure to
       *  `menuItemToDetail` without an extra cast. */
      options?: Array<{
        id: string;
        name: string;
        type: "SINGLE_CHOICE" | "MULTI_CHOICE";
        required: boolean;
        sortOrder: number;
        choices: Array<{
          id: string;
          label: string;
          priceDelta: number;
          sortOrder: number;
        }>;
      }>;
    }
  >;
  reviews?: Array<{ rating: number }>;
};

/** Rough price-bucket derived from the median of the menu (or 0). */
function derivePriceBucket(menu: PrismaMenuItem[]): ListingRestaurant["priceBucket"] {
  if (menu.length === 0) return "medium";
  const sorted = [...menu].map((m) => m.price).sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (mid < 200) return "budget";
  if (mid < 450) return "medium";
  return "premium";
}

/**
 * Synthetic delivery window — the schema only stores a single
 * `deliveryTime` integer (the upper bound). We derive a +10 minute
 * lower bound for the listing card's `X–Y min` row so the UI's
 * existing chip reads naturally.
 */
function deriveDeliveryWindow(deliveryTime: number): {
  timeMin: number;
  timeMax: number;
} {
  const max = Math.max(15, deliveryTime);
  const min = Math.max(15, max - 10);
  return { timeMin: min, timeMax: max };
}

/**
 * A deterministic promo string keyed off the restaurant id so each
 * seeded restaurant gets its own headline. Real promo logic is
 * out-of-scope for this milestone — a follow-up will wire a
 * `Promotion` model.
 */
function derivePromo(row: Pick<PrismaRestaurant, "id">): string | undefined {
  // Free delivery used to be keyed off `deliveryFee == 0`; the
  // field is deprecated so we no longer surface that phrase here.
  // Hash mod 3 — gives 3 deterministic variants across the seed.
  const bucket =
    [...row.id].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 3;
  if (bucket === 0) return "20% OFF up to ৳80";
  if (bucket === 1) return "Buy 1 Get 1 Free";
  return undefined;
}

/**
 * Compute the live rating + count for a restaurant from its joined
 * reviews. When the relation wasn't loaded (e.g. an API route that
 * didn't select it) we keep the persisted `rating` column as the
 * fallback so the UI never sees NaN.
 *
 * Real reviews always win, even if their average is below the
 * persisted default — fresh customer feedback is more accurate
 * than whatever was originally seeded.
 */
function ratingFromReviews(
  row: RestaurantRow,
): { rating: number; count: number } {
  const reviews = row.reviews;
  if (!reviews || reviews.length === 0) {
    return { rating: row.rating, count: 0 };
  }
  let sum = 0;
  for (const r of reviews) sum += r.rating;
  const count = reviews.length;
  return { rating: sum / count, count };
}

/**
 * Map a Prisma `Restaurant` row into the listing-card shape used
 * by `/restaurants` and the homepage carousel.
 *
 * The optional `distanceKm` argument is forwarded verbatim so the
 * /restaurants endpoint can stamp the distance onto each row after
 * it computes Haversine values from the customer's address.
 */
export async function restaurantToListing(
  row: RestaurantRow,
  extras: { distanceKm?: number } = {},
): Promise<ListingRestaurant> {
  const menu = row.menu ?? [];
  const { timeMin, timeMax } = deriveDeliveryWindow(row.deliveryTime);
  const { rating, count } = ratingFromReviews(row);
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    // Leave the image empty when the partner hasn't uploaded one —
    // the dashboard's restaurant card and the listing pages render
    // a neutral placeholder in that case instead of falling back to
    // a hardcoded demo asset.
    image: row.coverImage ?? "",
    rating,
    // `reviews` on the listing card is the count, not the row
    // aggregate. Zero when no real customer reviews exist yet.
    reviews: count,
    timeMin,
    timeMax,
    // The platform now owns the fee schedule. We approximate the
    // listing card by stamping the active config base fee. When
    // the consumer wants the exact number for their chosen
    // delivery pin, they fetch /api/delivery-fee/estimate.
    deliveryFee: (await loadActiveDeliveryFeeConfig()).baseFee,
    freeDelivery: false,
    priceBucket: derivePriceBucket(menu),
    promo: derivePromo(row),
    // Distinct menu-item categories (e.g. ["Biryani","Snacks"]). The
    // /restaurants page uses these on top of `cuisine` so a homepage
    // category chip like "Biryani" filters in restaurants that *cuisine*
    // is missing but who actually sell Biryani on their menu.
    menuCategories: collectMenuCategories(menu),
    // Only set when the caller actually computed a finite distance.
    // Omitted (undefined) otherwise so JSON serialisation drops it
    // and consumers can detect "no distance info".
    ...(Number.isFinite(extras.distanceKm)
      ? { distanceKm: extras.distanceKm as number }
      : {}),
    // কাজ ২ — propagate the partner's online flag so the listing
    // card can show "Currently Closed" without a second fetch.
    isAcceptingOrders: row.isAcceptingOrders,
    // ধাপ ৪ — surface admin verification status to the partner
    // dashboard (so they can see PENDING / REJECTED) and forward
    // the rejection reason when applicable.
    verificationStatus: row.verificationStatus,
    rejectionReason: row.rejectionReason ?? null,
    // B1 — listing API now mirrors the detail endpoint's
    // `address` field so a customer can pre-fill a delivery
    // address straight from the homepage / search results
    // without opening the detail page.
    address: row.address ?? "",
  };
}

/**
 * Normalised set of distinct menu-item categories for a restaurant.
 * Empty / whitespace strings are filtered, casing is preserved (the
 * /restaurants sidebar compares against the user-facing label which
 * is the same casing the partner saved on the menu).
 */
function collectMenuCategories(menu: PrismaMenuItem[]): string[] {
  const seen = new Set<string>();
  for (const m of menu) {
    const c = (m.category ?? "").trim();
    if (!c) continue;
    seen.add(c);
  }
  return [...seen];
}

/**
 * Map a single Prisma `MenuItem` into the detail-page shape.
 *
 * We deliberately carry `category` and `available` even though the
 * customer-facing `/restaurants/[id]` page doesn't render them —
 * the Partner Menu Management page reads both off `/api/restaurants/me`
 * and dropping them here made every menu item lose its category and
 * availability on the next refresh (since the mapper strips them
 * before the partner page sees the row).
 */
function menuItemToDetail(
  item: PrismaMenuItem & {
    options?: Array<{
      id: string;
      name: string;
      type: "SINGLE_CHOICE" | "MULTI_CHOICE";
      required: boolean;
      sortOrder: number;
      choices: Array<{
        id: string;
        label: string;
        priceDelta: number;
        sortOrder: number;
      }>;
    }>;
  },
): DetailMenuItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    price: item.price,
    image: item.image ?? "",
    popular: item.popular,
    category: item.category,
    available: item.available,
    // Feat 1 — round-trip the option groups so the Partner Modal
    // can re-seed its "Options" section, and so the Customer
    // Detail page's Add+ modal knows whether to open at all.
    options: item.options
      ? item.options
          .slice()
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.id.localeCompare(b.id);
          })
          .map((o) => ({
            id: o.id,
            name: o.name,
            type: o.type,
            required: o.required,
            sortOrder: o.sortOrder,
            choices: o.choices
              .slice()
              .sort((x, y) => {
                if (x.sortOrder !== y.sortOrder) return x.sortOrder - y.sortOrder;
                return x.id.localeCompare(y.id);
              })
              .map((c) => ({
                id: c.id,
                label: c.label,
                priceDelta: c.priceDelta,
                sortOrder: c.sortOrder,
              })),
          }))
      : null,
    // Surface the restaurant id so the cart / checkout flow can
    // POST the order to the correct restaurant without an extra
    // round-trip from the client.
    restaurantId: item.restaurantId,
  };
}

/**
 * Group a flat list of menu items into categories. The schema's
 * `MenuItem.category` is a free-form string (so partners aren't
 * restricted to a closed enum); the detail page's `MenuCategory[]`
 * preserves every distinct category.
 *
 * Feat 1 — callers that loaded `options[].choices[]` should pass
 * them through so `menuItemToDetail` can round-trip the tree and
 * the customer Detail page can decide whether to open the options
 * modal on Add+. We accept the wider shape so the option-free
 * path keeps the existing signature.
 */
export function groupMenuByCategory(
  items: Array<
    PrismaMenuItem & {
      options?: Array<{
        id: string;
        name: string;
        type: "SINGLE_CHOICE" | "MULTI_CHOICE";
        required: boolean;
        sortOrder: number;
        choices: Array<{
          id: string;
          label: string;
          priceDelta: number;
          sortOrder: number;
        }>;
      }>;
    }
  >,
): MenuCategory[] {
  const buckets = new Map<
    string,
    Array<
      PrismaMenuItem & {
        options?: Array<{
          id: string;
          name: string;
          type: "SINGLE_CHOICE" | "MULTI_CHOICE";
          required: boolean;
          sortOrder: number;
          choices: Array<{
            id: string;
            label: string;
            priceDelta: number;
            sortOrder: number;
          }>;
        }>;
      }
    >
  >();
  for (const it of items) {
    const key = it.category || "other";
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  return Array.from(buckets.entries()).map(([key, list]) => ({
    id: key,
    name: titleCase(key),
    items: list.map(menuItemToDetail),
  }));
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Map a Prisma `Restaurant` row (with its menu relation loaded)
 * into the detail-page shape used by both `/restaurants/[id]` and
 * the Partner Menu/Settings/Dashboard pages.
 *
 * We expose BOTH the customer-friendly aliases (`cover` / `hours`)
 * and the raw DB column names (`coverImage` / `openingHours`).
 * Previously the partner pages read `r.coverImage` / `r.openingHours`
 * while this mapper only returned `cover` / `hours`, so every
 * Settings save appeared to "lose" the cover image and opening
 * hours on the next page refresh (the form re-seeded with
 * `undefined`).
 */
export function restaurantToDetail(
  row: RestaurantRow,
): RestaurantDetail {
  const { rating, count } = ratingFromReviews(row);
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    // Customer-facing aliases — the `/restaurants/[id]` page reads
    // these. Empty string when no cover is set so the detail-page
    // renders its own neutral placeholder rather than a hardcoded
    // demo asset.
    cover: row.coverImage ?? "",
    hours: row.openingHours || "Hours not set",
    // Raw DB column names — the Partner Menu + Settings pages read
    // these so they can re-seed their forms with the exact value
    // that was persisted.
    coverImage: row.coverImage ?? "",
    openingHours: row.openingHours ?? "",
    address: row.address,
    rating,
    reviews: count,
    notice: "Delivery time may vary based on traffic and weather.",
    menu: groupMenuByCategory(row.menu ?? []),
    // কাজ ২ — propagate the partner's online/offline flag.
    isAcceptingOrders: row.isAcceptingOrders,
  };
}
