/**
 * Mock data for the partner settings page.
 *
 * Three groups:
 *   • Restaurant profile — name, address, cuisine, opening hours,
 *     cover image URL.
 *   • Contact info — owner name, phone, email.
 *   • Notification preferences — three toggles.
 *
 * The Settings page owns the form state in local React state and
 * hydrates from this file via a `useState(() => initialSettings)`
 * pattern — so swapping the seed updates the form on next mount.
 */

export type RestaurantProfile = {
  name: string;
  /** Single-line address summary shown in the input. */
  address: string;
  /** Map pin coordinates captured by the address picker. Null when
   *  the partner hasn't moved the pin yet — the parent falls back
   *  to `address` text in that case. */
  latitude: number | null;
  longitude: number | null;
  cuisine: string;
  /** "10:00 AM – 11:00 PM" — free-form so the partner can describe
   *  split shifts (e.g. "10:00 AM – 3:00 PM, 5:00 PM – 11:00 PM"). */
  hours: string;
  /** Cover image path under /public. */
  coverImage: string;
};

export type ContactInfo = {
  ownerName: string;
  phone: string;
  email: string;
};

export type NotificationPreferences = {
  /** New-order push notifications on the dashboard bell. */
  newOrders: boolean;
  /** Daily revenue summary email at end of day. */
  dailyEarningsDigest: boolean;
  /** Customer-review alerts (low rating, new comment, etc.). */
  reviewAlerts: boolean;
};

export type Settings = {
  profile: RestaurantProfile;
  contact: ContactInfo;
  notifications: NotificationPreferences;
};

/**
 * Cuisine options — mirrors the partner-register dropdown so the
 * partner sees the same vocabulary on both flows.
 */
export const cuisineOptions = [
  "Bangladeshi",
  "Indian",
  "Chinese & Thai",
  "Burgers & Pizza",
  "Sweets & Desserts",
  "Healthy Foods",
  "Other",
] as const;

export const initialSettings: Settings = {
  profile: {
    name: "Spice Junction",
    address: "House 12, Road 7, Banani, Dhaka 1213",
    latitude: null,
    longitude: null,
    cuisine: "Bangladeshi",
    hours: "10:00 AM – 11:00 PM",
    coverImage: "/assets/rest-1.png",
  },
  contact: {
    ownerName: "Tanvir Hossain",
    phone: "+880 1711-005142",
    email: "tanvir@spicejunction.bd",
  },
  notifications: {
    newOrders: true,
    dailyEarningsDigest: true,
    reviewAlerts: false,
  },
};

/** Notification toggle metadata — labels + descriptions for the UI. */
export const notificationToggleMeta: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}> = [
  {
    key: "newOrders",
    label: "New Order Alerts",
    description:
      "Get a notification on the dashboard bell whenever a new order comes in.",
  },
  {
    key: "dailyEarningsDigest",
    label: "Daily Earnings Summary",
    description:
      "Receive an end-of-day email summarising today's revenue and payouts.",
  },
  {
    key: "reviewAlerts",
    label: "Review Alerts",
    description:
      "Notify me when a customer leaves a new review, especially low ratings.",
  },
];
