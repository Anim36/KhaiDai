export type Category = {
  /** Stable identifier used by `/restaurants?category=…` filtering.
   *  Translation key fragment (matches `home.categoriesItems.<id>`). */
  id: string;
  /** Display label kept for backwards compat — the homepage now
   *  renders the localised version from `home.categoriesItems[id]`
   *  but other callers (e.g. /dishes filter) still read this. */
  label: string;
  icon: string; // svg file name in /assets
};

export type PromoCard = {
  title: string;
  subtitle: string;
  image: string;
  accent: "red" | "orange";
};

/**
 * A dish as rendered on the homepage "Top Trending Dishes"
 * carousel and the /dishes full grid.
 *
 * Populated by `GET /api/dishes/trending` (which aggregates real
 * OrderItem rows). For backwards-compatibility with any test
 * fixtures or storybook stories that still build a Dish by hand,
 * `restaurantId` is required.
 */
export type Dish = {
  /** Stable id — used as the cart line key. Required for the
   *  cart's de-dup + increment logic. */
  id: string;
  name: string;
  /** Display name of the restaurant the dish belongs to. Shown
   *  under the dish name on both the homepage card and the /dishes
   *  grid card. */
  restaurant: string;
  /** Restaurant id, needed by the cart so checkout can build the
   *  POST /api/orders payload with the correct restaurantId. */
  restaurantId: string;
  price: number;
  image: string;
  /** Used by the /dishes page filter chips. */
  category: string;
  /** Optional 1-line copy shown on the full grid card. */
  description: string;
  /** Mirrors `MenuItem.popular` — flips the Add button style on
   *  the restaurant-detail menu, but is informational here. */
  popular?: boolean;
  /** Optional count of delivered orders that included this dish.
   *  Surfaced as a small badge so visitors see "X+ orders". */
  orderCount?: number;
  /** Set by the API to indicate whether the row came from the
   *  trending aggregation (true) or the recent-menu fallback (false). */
  trending?: boolean;
};

export const categories: Category[] = [
  { id: "biryani", label: "Biryani", icon: "pot.svg" },
  { id: "burgers", label: "Burgers & Pizza", icon: "burger.svg" },
  { id: "chinese", label: "Chinese & Thai", icon: "pot2.svg" },
  { id: "sweets", label: "Sweets & Desserts", icon: "cake.svg" },
  { id: "snacks", label: "Snacks", icon: "snack.svg" },
  { id: "healthy", label: "Healthy Foods", icon: "salad.svg" },
];

export const promos: PromoCard[] = [
  {
    title: "৳100 Cashback on bKash!",
    subtitle: "Order min. ৳400 & pay with bKash online. Use code: BKASH100",
    image: "promo-1.png",
    accent: "red",
  },
  {
    title: "Free Delivery Weekend",
    subtitle:
      "Get completely free shipping on your favorite local restaurants nearby.",
    image: "promo-2.png",
    accent: "orange",
  },
];

/* -------------------------------------------------------------------------- */
/*  Dishes page filter                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Categories used by the /dishes page filter chips as a fallback
 * placeholder while the live API request is in flight. Once the
 * real dishes arrive, /dishes derives its own categories from the
 * fetched rows so adding a new partner category flows through
 * without editing this file.
 */
export const dishCategories: string[] = [
  "Biryani",
  "Burgers & Pizza",
  "Chinese & Thai",
  "Sweets & Desserts",
  "Snacks",
  "Healthy Foods",
];
