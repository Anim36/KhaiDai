/**
 * Shared menu-management types + the canonical "starter" list of
 * categories shown in the dropdown.
 *
 * The DB stores each menu item's `category` as a free-form `String`
 * (Prisma model `MenuItem.category`) so partners can introduce their
 * own categories ("Bengali Specials", "Chef's Pick", …) without a
 * schema migration. The list below is what the dropdown enumerates
 * by default; selecting "+ Add custom category" opens a free-text
 * input — see `MenuItemModal`.
 *
 * Id values use a stable kebab-case slug so URL params and React
 * keys stay predictable even after the dropdown text changes.
 */

export type MenuCategory =
  | "starters"
  | "mains"
  | "rice-biryani"
  | "soups"
  | "salads"
  | "sandwiches"
  | "wraps"
  | "sides"
  | "burgers"
  | "pizza"
  | "desserts"
  | "beverages";

/** Sentinel picked when the user wants to type their own category. */
export const CUSTOM_CATEGORY_SENTINEL = "__custom__";

export type MenuItem = {
  id: string;
  /** Display name, Outfit ExtraBold 16px in the Figma row. */
  name: string;
  /** BDT price, e.g. "৳420". */
  price: string;
  /** Pre-formatted for display in the row. */
  description: string;
  /**
   * Either a known slug from `menuCategories` (e.g. "rice-biryani")
   * or a free-form string the partner typed in via the custom
   * category input. The DB column accepts either.
   */
  category: string;
  /** Path to the dish photo (from /public/assets/dish-*.png). */
  image: string;
  /** Availability toggle state — the row's pill maps this to "Available" / "Unavailable". */
  available: boolean;
  /**
   * Feat 1 — option groups attached to this item (Size, Add-ons,
   * …). `choices` carries every concrete option (Large, Extra
   * Cheese, …) with its signed `priceDelta`. Server is the source
   * of truth — the modal edits this in-place on Add / Edit and
   * the page POSTs the whole structure back to
   * `/api/menu-items` so the partner can author & preview without
   * a per-field round-trip.
   */
  options?: MenuItemOptionDraft[];
};

/**
 * Feat 1 — the in-modal shape for an option group. We deliberately
 * carry BOTH `id` (server-generated when the option already exists)
 * and a stable per-modal uuid so React keys stay stable when the
 * partner reorders / deletes rows. The server reconciles by id
 * (`id=""` → create; existing id → update; missing id → delete).
 */
export type MenuItemOptionDraft = {
  id?: string;
  name: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE";
  required: boolean;
  choices: MenuItemOptionChoiceDraft[];
};
export type MenuItemOptionChoiceDraft = {
  id?: string;
  label: string;
  /** Signed ৳ delta — positive (surcharge) or negative (discount). */
  priceDelta: number;
};

/**
 * Default categories surfaced in the "Add New Item" dropdown.
 * Order matters — it's the order the partner sees them in.
 */
export const menuCategories: Array<{ key: MenuCategory; labelKey: string }> = [
  { key: "starters", labelKey: "partner.menu.categoryLabels.starters" },
  { key: "mains", labelKey: "partner.menu.categoryLabels.mains" },
  { key: "rice-biryani", labelKey: "partner.menu.categoryLabels.riceBiryani" },
  { key: "soups", labelKey: "partner.menu.categoryLabels.soups" },
  { key: "salads", labelKey: "partner.menu.categoryLabels.salads" },
  { key: "sandwiches", labelKey: "partner.menu.categoryLabels.sandwiches" },
  { key: "wraps", labelKey: "partner.menu.categoryLabels.wraps" },
  { key: "sides", labelKey: "partner.menu.categoryLabels.sides" },
  { key: "burgers", labelKey: "partner.menu.categoryLabels.burgers" },
  { key: "pizza", labelKey: "partner.menu.categoryLabels.pizza" },
  { key: "desserts", labelKey: "partner.menu.categoryLabels.desserts" },
  { key: "beverages", labelKey: "partner.menu.categoryLabels.beverages" },
];

/**
 * Display label resolver — used by the row's category chip + the
 * modal's <option>s so we have a single source of truth for the
 * default categories. Custom categories (free-form strings not in
 * `menuCategories`) are echoed back unchanged so the partner sees
 * exactly what they typed.
 */
export function categoryLabelKey(cat: string): string | null {
  const known = menuCategories.find((c) => c.key === cat);
  return known ? known.labelKey : null;
}

/**
 * Heuristic — does this category string match one of the defaults?
 * Used by the modal so editing an existing item correctly pre-selects
 * "Custom" if the stored value isn't one of the canned slugs.
 */
export function isKnownCategory(cat: string): cat is MenuCategory {
  return menuCategories.some((c) => c.key === cat);
}

export const initialMenuItems: MenuItem[] = [
  {
    id: "item-001",
    name: "Crispy Chicken Wings",
    price: "৳420",
    description: "6 pieces served with house dipping sauce.",
    category: "starters",
    image: "/assets/dish-1.png",
    available: true,
  },
  {
    id: "item-002",
    name: "Spicy Thai Soup",
    price: "৳280",
    description: "Coconut milk, mushrooms, lemongrass, galangal.",
    category: "soups",
    image: "/assets/dish-2.png",
    available: true,
  },
  {
    id: "item-003",
    name: "Beef Burger Deluxe",
    price: "৳650",
    description: "200g smash patty, aged cheddar, brioche bun.",
    category: "burgers",
    image: "/assets/dish-3.png",
    available: true,
  },
  {
    id: "item-004",
    name: "Margherita Pizza",
    price: "৳780",
    description: "Wood-fired, San Marzano tomato, fresh basil.",
    category: "pizza",
    image: "/assets/dish-4.png",
    available: false,
  },
  {
    id: "item-005",
    name: "Chicken Biryani",
    price: "৳420",
    description: "Basmati rice, saffron, free-range chicken.",
    category: "rice-biryani",
    image: "/assets/dish-detail-1.png",
    available: true,
  },
  {
    id: "item-006",
    name: "Pasta Alfredo",
    price: "৳590",
    description: "Fettuccine, parmesan cream, cracked black pepper.",
    category: "mains",
    image: "/assets/dish-detail-2.png",
    available: true,
  },
  {
    id: "item-007",
    name: "Molten Chocolate Cake",
    price: "৳360",
    description: "Valrhona dark chocolate, vanilla ice cream.",
    category: "desserts",
    image: "/assets/dish-detail-3.png",
    available: true,
  },
  {
    id: "item-008",
    name: "Mango Lassi",
    price: "৳180",
    description: "Ripe mango pulp, yogurt, cardamom, honey.",
    category: "beverages",
    image: "/assets/dish-detail-4.png",
    available: false,
  },
];
