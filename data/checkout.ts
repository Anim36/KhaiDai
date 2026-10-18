// Mock data for the Cart / Checkout page (`/checkout`).
// Payment method list is taken from the Figma spec (`section-payment`).
//
// Job 1 (কাজ ১) — সরলীকরণ:
//   আগে bKash / Nagad / Rocket / Card আলাদা radio বোতাম ছিল। এখন
//   কেবল "Online Payment" + "Cash on Delivery" — কারণ SSLCommerz
//   sandbox নিজেই gateway page-এ গিয়ে bKash/Nagad/Rocket/Card
//   যেকোনোটা বেছে নেয়। আলাদা radio রাখলে UI-এ redundancy বাড়ে
//   এবং কোনো বাস্তব সুবিধা আসে না।
//
// Server-side enum (Prisma `PaymentMethod`) অপরিবর্তিত রেখেছি
// (BKASH/NAGAD/ROCKET/CARD/CASH) কারণ:
//   1. Existing Order rows-এ historical paymentMethod আছে,
//   2. Admin Reports/Earnings bucket-by-provider করে,
//   3. Customer intent vs confirmed gateway wallet আলাদা রাখা দরকার।

import type { ComponentType, SVGProps } from "react";
import {
  BanknoteIcon,
  CreditCardIcon,
} from "@/components/icons";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export type PaymentMethodId = "online" | "cod";

/**
 * Visual brand badges displayed inside the "Online Payment" radio
 * tile. Order matters — left-to-right is how they show in the UI.
 * Click does NOT select a sub-method; the entire tile is one radio
 * ("online") and the gateway lets them pick at checkout.
 */
const ONLINE_BADGES: readonly string[] = [
  "/icons/bkash-logo.png",
  "/icons/nagad-logo.png",
  "/icons/rocket-logo.png",
];

/**
 * Payment method tile payload.
 *   • `Icon`        — generic inline glyph used for the "Online" tile
 *                     (CreditCardIcon) and the "Cash" tile (BanknoteIcon).
 *   • `brandBadges` — when set, the row renders a horizontal strip
 *                     of small brand PNGs alongside the main icon to signal
 *                     "all these options work here". Only one radio
 *                     option is selected either way.
 *   • `badgeAlt`    — a11y label for the brand badge strip (e.g.
 *                     "bKash, Nagad, Rocket, Visa and Mastercard all
 *                     supported").
 *   • `sublabel`    — secondary line under the title for context. The
 *                     "Online" tile uses it to tell the customer where
 *                     the actual wallet picker lives.
 */
export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  sublabel?: string;
  Icon?: ComponentType<IconProps>;
  brandBadges?: readonly string[];
  badgeAlt?: string;
};

export const paymentMethods: PaymentMethod[] = [
  {
    id: "online",
    label: "Online Payment",
    sublabel:
      "Pay via BKash, Nagad, Rocket or Card — pick the wallet on the next screen.",
    Icon: CreditCardIcon,
    brandBadges: ONLINE_BADGES,
    badgeAlt: "BKash, Nagad, Rocket and Card accepted",
  },
  {
    id: "cod",
    label: "Cash on Delivery",
    sublabel: "Pay in cash when your food arrives.",
    Icon: BanknoteIcon,
  },
];

export const defaultPaymentMethod: PaymentMethodId = "online";

/**
 * 5% VAT-style tax on items subtotal. The cart context owns items
 * + subtotal; the delivery fee, on the other hand, is fetched at
 * runtime via `GET /api/delivery-fee/estimate` and forwarded into
 * the summary panel as a prop (see CheckoutPage).
 */
export const TAX_RATE = 0.05;