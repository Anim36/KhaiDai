// Mock data for the `/orders/[id]/track` route.
//
// We don't have a real orders table yet, so the page synthesises a
// realistic-looking tracking view from the URL `id` segment. The id is
// hashed (deterministic) to pick one of a few pre-baked riders, restaurant
// names, and ETA values — keeps the demo feeling alive without hard-coding
// "test" everywhere.

export type Rider = {
  name: string;
  phone: string;
  rating: number;
  deliveries: number;
  vehicle: "bike" | "scooter";
  /** Initials used for the avatar fallback circle. */
  initials: string;
};

export type RestaurantStop = {
  name: string;
  address: string;
};

export type DeliveryDestination = {
  label: string;
  address: string;
};

export type OrderTracking = {
  id: string;
  orderNumber: string;
  placedAt: string;
  etaMinutes: number;
  status:
    | "confirmed"
    | "preparing"
    | "picked_up"
    | "on_the_way"
    | "delivered";
  statusLabel: string;
  totalLabel: string;
  itemCount: number;
  rider: Rider;
  restaurant: RestaurantStop;
  destination: DeliveryDestination;
};

const RIDERS: Rider[] = [
  {
    name: "Rafiq Hossain",
    phone: "+880 1711-223344",
    rating: 4.9,
    deliveries: 1284,
    vehicle: "bike",
    initials: "RH",
  },
  {
    name: "Imran Khan",
    phone: "+880 1815-998877",
    rating: 4.8,
    deliveries: 932,
    vehicle: "scooter",
    initials: "IK",
  },
  {
    name: "Sabbir Ahmed",
    phone: "+880 1611-445566",
    rating: 4.7,
    deliveries: 612,
    vehicle: "bike",
    initials: "SA",
  },
  {
    name: "Nusrat Jahan",
    phone: "+880 1912-776655",
    rating: 5.0,
    deliveries: 1780,
    vehicle: "scooter",
    initials: "NJ",
  },
];

const RESTAURANTS: RestaurantStop[] = [
  { name: "Kacchi Bhai", address: "Mirpur 10, Dhaka" },
  { name: "Pizza Hub", address: "Dhanmondi, Dhaka" },
  { name: "Sultan's Dine", address: "Banani, Dhaka" },
  { name: "Chillox", address: "Mohammadpur, Dhaka" },
];

const DESTINATIONS: DeliveryDestination[] = [
  { label: "Home", address: "House 12, Road 7, Dhanmondi, Dhaka" },
  { label: "Office", address: "Level 4, Bay Tower, Gulshan 2, Dhaka" },
  { label: "Hostel", address: "Tinshed 3, North South University, Bashundhara" },
];

/**
 * Tiny stable string-hash so the same URL id always resolves to the same
 * tracked order (without needing a real database).
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Returns a synthesised order-tracking record for the given URL id. If
 * the id is falsy we still produce something — the route should not
 * crash on `notFound`-style ids the user types into the URL.
 */
export function getOrderTracking(id: string): OrderTracking {
  const h = hash(id || "test");
  const rider = RIDERS[h % RIDERS.length];
  const restaurant = RESTAURANTS[(h >> 3) % RESTAURANTS.length];
  const destination = DESTINATIONS[(h >> 5) % DESTINATIONS.length];

  // Step the demo along so the page feels alive: every id gets a
  // different "current step" (Confirmed … Delivered).
  const steps = [
    "confirmed",
    "preparing",
    "picked_up",
    "on_the_way",
    "delivered",
  ] as const;
  const status = steps[h % steps.length];
  const statusLabel = {
    confirmed: "Order Confirmed",
    preparing: "Restaurant is preparing your food",
    picked_up: "Rider picked up your order",
    on_the_way: "On the way to you",
    delivered: "Delivered — enjoy!",
  }[status];

  // ETAs only matter when the food is on the move; clamp the rest to a
  // far enough-out value to keep the timeline honest.
  const etaMinutes =
    status === "delivered"
      ? 0
      : status === "confirmed"
        ? 38
        : status === "preparing"
          ? 26
          : status === "picked_up"
            ? 14
            : 8;

  return {
    id,
    orderNumber: `KD-${(h % 9999).toString().padStart(4, "0")}`,
    placedAt: "Today, 1:42 PM",
    etaMinutes,
    status,
    statusLabel,
    totalLabel: "৳1,480",
    itemCount: 3,
    rider,
    restaurant,
    destination,
  };
}
