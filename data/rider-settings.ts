/**
 * Mock data + validation rules for the rider settings page.
 *
 *   • `initialSettings` — full Settings object seeded from the
 *     existing rider profile so the form opens pre-populated.
 *
 *   • `payoutMethods` — supported payout destinations (bKash,
 *     Nagad, Rocket, Bank). Used by the PayoutSection's select.
 *
 *   • `vehicleTypes` — re-exported from `@/data/rider` so the
 *     settings form uses the exact same options as the
 *     registration form. Adding a vehicle type upstream flows
 *     into both flows automatically.
 *
 *   • `notificationToggleMeta` — 3 toggles mirroring the rider
 *     registration defaults so the UI feels consistent across
 *     the two flows.
 *
 *   • `validateSettings(settings)` — pure validator used by the
 *     page-level orchestrator on Save Changes. The same rules
 *     will be reusable server-side when the real API lands.
 */

import { vehicleTypes, type VehicleType } from "@/data/rider";

export { vehicleTypes };
export type { VehicleType };

export type RiderProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  /** Optional avatar URL — falls back to initials in the UI. */
  avatar: string | null;
};

export type VehicleInfo = {
  type: VehicleType;
  registrationNumber: string;
};

export type PayoutMethod = "bkash" | "nagad" | "rocket" | "bank";

export type PayoutInfo = {
  method: PayoutMethod;
  /** The destination identifier — phone for mobile wallets,
   *  "Bank · account number" for bank transfers. */
  destination: string;
  accountHolder: string;
};

export type NotificationPreferences = {
  // Keys mirror the RiderProfile columns the new
  // /api/riders/notification-preferences route persists. We
  // moved away from the previous `newRequestPush / payout­Confirmations /
  // weeklySummaryEmail` aliases because they were vendor-flavored
  // and didn't match the rest of the platform's wiring.
  notifyNewRequest: boolean;
  notifyPayout: boolean;
  notifyWeeklySummary: boolean;
};

export type RiderSettings = {
  profile: RiderProfileForm;
  vehicle: VehicleInfo;
  payout: PayoutInfo;
  notifications: NotificationPreferences;
};

export const initialSettings: RiderSettings = {
  profile: {
    // Empty — the Settings page now fetches these from
    // /api/riders/me. Kept in the type only because the legacy
    // validator still references the shape; new code should
    // never read this seed.
    fullName: "",
    email: "",
    phone: "",
    avatar: null,
  },
  vehicle: {
    type: "bike",
    registrationNumber: "",
  },
  payout: {
    method: "bkash",
    destination: "",
    accountHolder: "",
  },
  notifications: {
    notifyNewRequest: true,
    notifyPayout: true,
    notifyWeeklySummary: false,
  },
};

/* -------------------------------------------------------------------------- */
/*  Payout method options                                                     */
/* -------------------------------------------------------------------------- */

export const payoutMethods: Array<{ value: PayoutMethod; label: string }> = [
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "bank", label: "Bank Transfer" },
];

/* -------------------------------------------------------------------------- */
/*  Notification toggle metadata                                              */
/* -------------------------------------------------------------------------- */

export const notificationToggleMeta: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  /** When true the toggle is saved against the rider but a follow-up
   *  pipeline (e.g. email) hasn't shipped — the UI shows a small
   *  "Coming soon" tag next to the label so riders don't expect an
   *  artefact we don't yet send. */
  comingSoon?: boolean;
}> = [
  {
    key: "notifyNewRequest",
    label: "New delivery request bell",
    description:
      "Show an alert in the notification bell when a new delivery request arrives while you're online.",
  },
  {
    key: "notifyPayout",
    label: "Payout status bell",
    description:
      "Show an alert in the notification bell when a payout status changes (pending, completed, or failed).",
  },
  {
    key: "notifyWeeklySummary",
    label: "Weekly summary email",
    description:
      "Once a week, send an email summarising your trips and earnings. We'll only email you when there's something to share.",
    comingSoon: true,
  },
];

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

export type SettingsErrors = {
  fullName?: string;
  email?: string;
  phone?: string;
  registrationNumber?: string;
  payoutDestination?: string;
  accountHolder?: string;
};

/**
 * Validate the rider settings form. Returns an empty object
 * when everything is valid.
 *
 * Rules mirror the partner / register validators so the visual
 * feedback is consistent across role flows.
 */
export function validateSettings(settings: RiderSettings): SettingsErrors {
  const errors: SettingsErrors = {};

  const fullName = settings.profile.fullName.trim();
  if (!fullName) errors.fullName = "Full name is required.";
  else if (fullName.length < 2) errors.fullName = "Full name is too short.";

  const email = settings.profile.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.email = "Enter a valid email address.";

  const phone = settings.profile.phone.trim();
  if (!phone) errors.phone = "Phone is required.";
  else if (!/^[+\d][\d\s-]{9,}$/.test(phone))
    errors.phone = "Enter a valid phone number.";

  const reg = settings.vehicle.registrationNumber.trim();
  if (!reg)
    errors.registrationNumber = "Vehicle registration number is required.";
  else if (reg.length < 4)
    errors.registrationNumber = "Enter a valid registration number.";

  const dest = settings.payout.destination.trim();
  if (!dest) errors.payoutDestination = "Payout destination is required.";
  else if (
    settings.payout.method !== "bank" &&
    !/^[+\d][\d\s-]{9,}$/.test(dest)
  )
    errors.payoutDestination = "Enter a valid phone number.";

  const holder = settings.payout.accountHolder.trim();
  if (!holder) errors.accountHolder = "Account holder name is required.";

  return errors;
}
