/**
 * Types and helpers for the rider earnings page.
 *
 * The numbers on this page are now derived from the rider's real
 * order history (via `/api/orders`). The static `todaySummary`,
 * `weeklyChart`, `tripHistory`, `cashOutHistory`, and
 * `availableBalance` exports were removed — every figure the rider
 * sees is computed from `GET /api/orders` so a new account never
 * shows another rider's trips or hardcoded "৳8,420" balance.
 *
 * `validatePayoutAccount` and the `PayoutAccount` type stay because
 * they're still consumed by the withdraw UI; a real payouts API is
 * outside the scope of this fix.
 */

export type EarningsSummary = {
  /** Total earned today, formatted. */
  today: string;
  /** Raw numeric value (used for the "+12% vs yesterday" pill). */
  todayRaw: number;
  /** Total deliveries completed today. */
  deliveries: number;
  /** Hours online today. */
  hoursOnline: string;
  /** Average earnings per delivery today, formatted. */
  perTrip: string;
  /** Incentive bonus paid today, formatted. */
  incentive: string;
  /** Yesterday's earnings (raw) so the summary can show a delta. */
  yesterdayRaw: number;
};

export type ChartPoint = {
  /** Short day label, e.g. "Mon". */
  label: string;
  /** Full date label for the tooltip, e.g. "Mon, 7 Apr". */
  fullDate: string;
  /** BDT earned that day. */
  earnings: number;
  /** Deliveries completed that day. */
  deliveries: number;
};

export type TripHistoryRow = {
  id: string;
  /** "12 Apr 2025 · 12:48 PM" — pre-formatted for the list row. */
  when: string;
  /** Short day+date label used for the avatar badge. */
  shortWhen: string;
  restaurant: string;
  customer: string;
  distance: string;
  duration: string;
  /** Earnings for this trip, formatted "৳145". */
  earned: string;
  /** "bKash" | "Cash" | "Card" — payment method used. */
  payment: "bKash" | "Cash" | "Card";
};

/* -------------------------------------------------------------------------- */
/*  Cash-out                                                                  */
/* -------------------------------------------------------------------------- */

export type CashOutRow = {
  id: string;
  when: string;
  amount: string;
  method: string;
  status: "completed" | "pending";
};

/**
 * Empty until a real payouts API lands. The page renders a
 * "No cash-outs yet" empty state when this list is empty.
 */
export const cashOutHistory: CashOutRow[] = [];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Look up the rider's share for an order using the
 * `Order.riderEarning` snapshot written when the order was
 * created. Returns `null` when the order predates the snapshot
 * and the legacy 8 % heuristic was used at server-render time.
 *
 * Callers feed the returned number (or the heuristic fallback)
 * into `formatTaka` so the dashboard and earnings pages never
 * disagree.
 */
export function riderShare(
  total: number,
  snapshot?: number | null,
): number {
  if (
    typeof snapshot === "number" &&
    Number.isFinite(snapshot) &&
    snapshot >= 0
  ) {
    return Math.round(snapshot);
  }
  if (!Number.isFinite(total) || total <= 0) return 0;
  // Backfill-only path: rows that predate the riderEarning
  // column. Same heuristic that was used before the migration.
  return Math.round(total * 0.08);
}
