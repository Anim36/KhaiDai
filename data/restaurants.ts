// Mock restaurant data for the Restaurant Listing page.
// Includes cuisine, rating, delivery time, fee, free-delivery flag.

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  image: string;
  rating: number;
  reviews: number;
  timeMin: number;     // min of delivery-time range
  timeMax: number;     // max of delivery-time range
  deliveryFee: number; // Taka
  freeDelivery: boolean;
  priceBucket: "budget" | "medium" | "premium";
  promo?: string;
  /**
   * Free-form street address. Surfaced on the listing card so a
   * customer can pick the closest restaurant without opening the
   * detail page, and used as the suggested default when seeding a
   * new delivery address. Same shape as the detail endpoint's
   * `address` field; the listing endpoint now mirrors it.
   */
  address?: string;
  /**
   * Straight-line distance (km) from the customer's selected
   * address to the restaurant's pin, computed by
   * `/api/restaurants?lat=&lng=`. Only populated when the request
   * carries lat/lng AND the restaurant has its own pin.
   */
  distanceKm?: number;
  /**
   * Distinct menu-item categories for this restaurant. Populated
   * by `/api/restaurants` from the joined `MenuItem` rows. Used by
   * the homepage category strip — clicking "Biryani" filters in any
   * restaurant whose `cuisine` doesn't mention biryani but whose
   * menu does.
   */
  menuCategories?: string[];
  /**
   * কাজ ২ — partner online/offline state. Defaults to true; the
   * listing card / homepage carousel can use this to label the
   * restaurant "Currently Closed" and `/api/orders` refuses to
   * create an order when this is false.
   */
  isAcceptingOrders?: boolean;
  /**
   * ধাপ ৪ — Admin verification gate. The customer-facing endpoint
   * only ever returns APPROVED rows so this is always "APPROVED"
   * for public listings; the partner dashboard, however, uses the
   * full set (PENDING / APPROVED / REJECTED) so the partner can
   * see where their application stands.
   */
  verificationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  /**
   * ধাপ ৪ — when verificationStatus is "REJECTED" the admin can
   * attach a note. The partner dashboard surfaces it inline so the
   * partner knows what to fix before re-submitting.
   */
  rejectionReason?: string | null;
};

export const restaurants: Restaurant[] = [
  {
    id: "r1",
    name: "Kacchi Bhai",
    cuisine: "Bengali · Biryani",
    image: "/assets/rest-1.png",
    rating: 4.8,
    reviews: 1240,
    timeMin: 25,
    timeMax: 35,
    deliveryFee: 40,
    freeDelivery: false,
    priceBucket: "medium",
    promo: "20% OFF up to ৳80",
  },
  {
    id: "r2",
    name: "Pizza Hub",
    cuisine: "Italian · Pizza",
    image: "/assets/rest-2.png",
    rating: 4.6,
    reviews: 980,
    timeMin: 30,
    timeMax: 40,
    deliveryFee: 60,
    freeDelivery: false,
    priceBucket: "medium",
  },
  {
    id: "r3",
    name: "Chillox",
    cuisine: "Burgers · Fast Food",
    image: "/assets/rest-3.png",
    rating: 4.7,
    reviews: 2105,
    timeMin: 20,
    timeMax: 30,
    deliveryFee: 35,
    freeDelivery: true,
    priceBucket: "budget",
    promo: "Free delivery",
  },
  {
    id: "r4",
    name: "Madchef",
    cuisine: "Thai · Asian",
    image: "/assets/rest-4.png",
    rating: 4.5,
    reviews: 612,
    timeMin: 35,
    timeMax: 45,
    deliveryFee: 70,
    freeDelivery: false,
    priceBucket: "premium",
  },
  {
    id: "r5",
    name: "Sultan's Dine",
    cuisine: "Bengali · Biryani",
    image: "/assets/rest-5.png",
    rating: 4.9,
    reviews: 3040,
    timeMin: 30,
    timeMax: 40,
    deliveryFee: 50,
    freeDelivery: false,
    priceBucket: "premium",
    promo: "Buy 1 Get 1 Free",
  },
  {
    id: "r6",
    name: "Nando's",
    cuisine: "Portuguese · Chicken",
    image: "/assets/rest-6.png",
    rating: 4.4,
    reviews: 850,
    timeMin: 25,
    timeMax: 35,
    deliveryFee: 0,
    freeDelivery: true,
    priceBucket: "medium",
  },
  {
    id: "r7",
    name: "Star Kabab",
    cuisine: "Bengali · Kebab",
    image: "/assets/rest-3.png",
    rating: 4.6,
    reviews: 720,
    timeMin: 20,
    timeMax: 30,
    deliveryFee: 45,
    freeDelivery: false,
    priceBucket: "budget",
  },
  {
    id: "r8",
    name: "Thai Emerald",
    cuisine: "Thai · Asian",
    image: "/assets/rest-2.png",
    rating: 4.3,
    reviews: 410,
    timeMin: 40,
    timeMax: 55,
    deliveryFee: 80,
    freeDelivery: false,
    priceBucket: "premium",
  },
];

/* ---------- Filter option sets (sidebar checkboxes) ---------- */

/**
 * Seed cuisine values shown in the sidebar when no restaurants have
 * loaded yet (e.g. during the very first render). Once the listing
 * fetch returns, the parent (`RestaurantsPage`) replaces this with
 * a dynamic list derived from the actual cuisines stored on each
 * row so partner-added cuisines ("Bengali Specials", "Chef's Pick")
 * show up without a code change.
 */
export const cuisineOptions = [
  "Bengali",
  "Indian",
  "Italian",
  "Chinese",
  "Thai",
  "Mexican",
  "Burgers",
  "Pizza",
  "Desserts",
  "Healthy",
] as const;

export const ratingOptions = ["4.5+", "4.0+", "3.5+"] as const;

export const priceOptions = [
  { id: "budget", label: "Budget · ৳" },
  { id: "medium", label: "Medium · ৳৳" },
  { id: "premium", label: "Premium · ৳৳৳" },
] as const;

export const deliveryOptions = [
  { id: "under30", label: "Under 30 min", max: 30 },
  { id: "under45", label: "Under 45 min", max: 45 },
  { id: "any", label: "Any time", max: 999 },
] as const;

export const offerOptions = [
  "Free Delivery",
  "Accepting Vouchers",
  "Deals",
] as const;

/**
 * Cuisine id — historically a closed union of the default seed
 * list, but partner-added cuisines are free-form strings on the
 * server, so the type is now `string`. The closed values are still
 * exported as a runtime list (`cuisineOptions`) for the seed.
 */
export type CuisineId = string;
export type RatingId = (typeof ratingOptions)[number];
export type PriceId = (typeof priceOptions)[number]["id"];
export type DeliveryId = (typeof deliveryOptions)[number]["id"];
export type OfferId = (typeof offerOptions)[number];
