// Mock data for the restaurant-detail page (`/restaurants/[id]`).
// Each entry's `id` matches the same id used in `data/restaurants.ts`
// so the listing card link `<Link href="/restaurants/{r.id}">` lands on
// the right detail page without any slug mapping.

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number; // Taka
  image: string;
  popular?: boolean;
  /**
   * Free-form category slug set by the partner (e.g. "starters",
   * "mains", "burgers"). The customer-side detail page doesn't
   * render it, but the Partner Menu page needs the exact value to
   * round-trip CRUD operations without silently defaulting the
   * category on every refresh.
   */
  category?: string;
  /** Availability flag toggled from the Partner Menu page. */
  available?: boolean;
  /**
   * Restaurant id the item belongs to. Carried through the cart
   * context so the checkout page can POST `/api/orders` without
   * having to re-derive it from URL params or another fetch.
   */
  restaurantId?: string;
  /**
   * Feat 1 — customisation / add-on groups attached to this
   * item. `null` or `[]` means "no customisation" and the
   * customer sees a plain "Add +" button.
   */
  options?: MenuItemOptionDetail[] | null;
};

export type MenuItemOptionDetail = {
  id: string;
  name: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE";
  required: boolean;
  sortOrder: number;
  choices: MenuItemOptionChoiceDetail[];
};

export type MenuItemOptionChoiceDetail = {
  id: string;
  label: string;
  priceDelta: number;
  sortOrder: number;
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

export type RestaurantDetail = {
  id: string;
  name: string;
  cuisine: string;
  /** Customer-facing cover field (used by `/restaurants/[id]`). */
  cover: string;
  rating: number;
  reviews: number;
  address: string;
  /** Customer-facing opening-hours string with a default fallback
   *  ("Hours not set") when the partner hasn't filled one in. */
  hours: string;
  /** Raw `coverImage` column from the DB — used by the Partner
   *  Settings page to round-trip saves without a rename. */
  coverImage?: string;
  /** Raw `openingHours` column from the DB — used by the Partner
   *  Settings page so the saved value (including the empty string)
   *  comes back to the form faithfully. */
  openingHours?: string;
  notice?: string;
  menu: MenuCategory[];
  /**
   * কাজ ২ — partner online/offline state. The restaurant detail
   * page renders "Currently Closed" + disables Add buttons when
   * this is false.
   */
  isAcceptingOrders?: boolean;
};

const COVER = "/assets/a3238.png";
const IMG = (n: number) => `/assets/dish-detail-${n}.png`;

export const restaurantDetails: RestaurantDetail[] = [
  {
    id: "r1",
    name: "Kacchi Bhai",
    cuisine: "Bengali · Biryani",
    cover: COVER,
    rating: 4.8,
    reviews: 1240,
    address: "House 12, Road 7, Dhanmondi, Dhaka",
    hours: "10:00 AM – 11:00 PM",
    notice: "Delivery time may vary based on traffic and weather.",
    menu: [
      {
        id: "biryani",
        name: "Signature Dishes",
        items: [
          {
            id: "kacchi-biryani",
            name: "Kacchi Biryani (Full)",
            description:
              "Aromatic basmati cooked in dum style with tender mutton.",
            price: 320,
            image: IMG(1),
            popular: true,
          },
          {
            id: "mutton-tehari",
            name: "Mutton Tehari",
            description:
              "Slow-cooked mutton with fragrant basmati and traditional spices.",
            price: 280,
            image: IMG(2),
          },
        ],
      },
      {
        id: "starters",
        name: "Starters & Sides",
        items: [
          {
            id: "seekh-kebab",
            name: "Seekh Kebab",
            description:
              "Minced lamb kebab grilled over charcoal with mint chutney.",
            price: 180,
            image: IMG(3),
          },
          {
            id: "borhani",
            name: "Borhani",
            description:
              "Traditional yogurt-based digestive drink with mustard and mint.",
            price: 40,
            image: IMG(4),
          },
        ],
      },
      {
        id: "drinks",
        name: "Drinks & Desserts",
        items: [
          {
            id: "firni",
            name: "Firni",
            description:
              "Traditional rice pudding flavored with cardamom and rose water.",
            price: 90,
            image: IMG(1),
          },
          {
            id: "borhani-jar",
            name: "Borhani (Jar)",
            description:
              "Family-size jar of our house-made borhani with mint.",
            price: 120,
            image: IMG(2),
          },
        ],
      },
    ],
  },
  {
    id: "r2",
    name: "Pizza Hub",
    cuisine: "Italian · Pizza",
    cover: COVER,
    rating: 4.6,
    reviews: 980,
    address: "Road 11, Banani, Dhaka",
    hours: "11:00 AM – 12:00 AM",
    menu: [
      {
        id: "pizzas",
        name: "Pizzas",
        items: [
          {
            id: "margherita",
            name: "Classic Margherita",
            description: "Buffalo mozzarella, fresh basil, San Marzano tomato.",
            price: 450,
            image: IMG(1),
            popular: true,
          },
          {
            id: "pepperoni",
            name: "Pepperoni Feast",
            description:
              "Loaded with pepperoni, mozzarella and our signature tomato sauce.",
            price: 620,
            image: IMG(2),
          },
        ],
      },
      {
        id: "drinks",
        name: "Drinks",
        items: [
          {
            id: "lemonade",
            name: "Mint Lemonade",
            description: "House-made lemonade with crushed mint and ice.",
            price: 120,
            image: IMG(3),
          },
        ],
      },
    ],
  },
  {
    id: "r3",
    name: "Chillox",
    cuisine: "Burgers · Fast Food",
    cover: COVER,
    rating: 4.7,
    reviews: 2105,
    address: "Gulshan 2, Dhaka",
    hours: "12:00 PM – 11:00 PM",
    menu: [
      {
        id: "burgers",
        name: "Burgers",
        items: [
          {
            id: "classic-smash",
            name: "Classic Smash Burger",
            description: "Double patty, American cheese, caramelized onion.",
            price: 320,
            image: IMG(3),
            popular: true,
          },
          {
            id: "spicy-chicken",
            name: "Spicy Chicken Burger",
            description: "Crispy chicken thigh, sriracha mayo, pickles.",
            price: 280,
            image: IMG(4),
          },
        ],
      },
      {
        id: "sides",
        name: "Sides",
        items: [
          {
            id: "loaded-fries",
            name: "Loaded Fries",
            description: "Cheese sauce, bacon bits, scallions.",
            price: 220,
            image: IMG(1),
          },
          {
            id: "onion-rings",
            name: "Onion Rings",
            description: "Crispy beer-battered onion rings with ranch dip.",
            price: 180,
            image: IMG(2),
          },
        ],
      },
    ],
  },
  {
    id: "r4",
    name: "Madchef",
    cuisine: "Thai · Asian",
    cover: COVER,
    rating: 4.5,
    reviews: 612,
    address: "Banani, Dhaka",
    hours: "11:00 AM – 11:00 PM",
    menu: [
      {
        id: "thai",
        name: "Thai Specials",
        items: [
          {
            id: "pad-thai",
            name: "Pad Thai",
            description: "Rice noodles, peanuts, bean sprouts, lime.",
            price: 380,
            image: IMG(1),
          },
          {
            id: "green-curry",
            name: "Green Curry Chicken",
            description: "Aromatic green curry with Thai basil and bamboo.",
            price: 420,
            image: IMG(2),
          },
        ],
      },
    ],
  },
  {
    id: "r5",
    name: "Sultan's Dine",
    cuisine: "Bengali · Biryani",
    cover: COVER,
    rating: 4.9,
    reviews: 3040,
    address: "Mirpur 10, Dhaka",
    hours: "10:00 AM – 11:00 PM",
    menu: [
      {
        id: "biryani",
        name: "Signature Dishes",
        items: [
          {
            id: "sultans-platter",
            name: "Kacchi Khazana (Sultan's Platter)",
            description: "Full kacchi biryani with borhani and salad.",
            price: 520,
            image: IMG(1),
            popular: true,
          },
          {
            id: "beef-tehari",
            name: "Beef Tehari",
            description: "Slow-cooked beef with fragrant basmati rice.",
            price: 380,
            image: IMG(2),
          },
        ],
      },
      {
        id: "drinks",
        name: "Drinks",
        items: [
          {
            id: "borhani-large",
            name: "Borhani (Large)",
            description: "Family-size jar of our house-made borhani.",
            price: 150,
            image: IMG(3),
          },
        ],
      },
    ],
  },
  {
    id: "r6",
    name: "Nando's",
    cuisine: "Portuguese · Chicken",
    cover: COVER,
    rating: 4.4,
    reviews: 850,
    address: "Gulshan 1, Dhaka",
    hours: "11:00 AM – 11:00 PM",
    menu: [
      {
        id: "chicken",
        name: "Grilled Chicken",
        items: [
          {
            id: "peri-peri-chicken",
            name: "Peri-Peri Chicken (Half)",
            description: "Flame-grilled chicken basted in peri-peri sauce.",
            price: 480,
            image: IMG(4),
            popular: true,
          },
          {
            id: "wings",
            name: "Peri-Peri Wings",
            description: "Crispy wings tossed in our signature peri-peri.",
            price: 320,
            image: IMG(1),
          },
        ],
      },
    ],
  },
  {
    id: "r7",
    name: "Star Kabab",
    cuisine: "Bengali · Kebab",
    cover: COVER,
    rating: 4.6,
    reviews: 720,
    address: "Old Dhaka",
    hours: "5:00 PM – 11:00 PM",
    menu: [
      {
        id: "kebabs",
        name: "Kebabs",
        items: [
          {
            id: "shami-kebab",
            name: "Shami Kebab",
            description: "Melt-in-mouth lentil and meat kebabs.",
            price: 240,
            image: IMG(1),
          },
          {
            id: "reshmi-kebab",
            name: "Reshmi Kebab",
            description: "Silky chicken kebab in a creamy marinade.",
            price: 280,
            image: IMG(2),
          },
        ],
      },
    ],
  },
  {
    id: "r8",
    name: "Thai Emerald",
    cuisine: "Thai · Asian",
    cover: COVER,
    rating: 4.3,
    reviews: 410,
    address: "Uttara, Dhaka",
    hours: "11:00 AM – 10:30 PM",
    menu: [
      {
        id: "curry",
        name: "Curries",
        items: [
          {
            id: "massaman-curry",
            name: "Massaman Curry",
            description: "Slow-braised beef in mild peanut curry.",
            price: 460,
            image: IMG(2),
            popular: true,
          },
        ],
      },
    ],
  },
];

/** Look up a restaurant detail record by its id (slug). */
export function findRestaurantDetail(id: string) {
  return restaurantDetails.find((r) => r.id === id);
}
