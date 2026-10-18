/**
 * Mock data for the partner earnings page.
 *
 * Three summary tiles (today / this week / this month), the daily
 * revenue series that backs the chart's "Last 30 days" view, and a
 * hard-coded transaction history so the table always looks populated.
 *
 * Weekly and monthly aggregations are computed from the daily series
 * inside the chart component — keeping a single source of truth means
 * the chart stays accurate if we ever tweak the raw values.
 */

export type SummaryCardData = {
  id: "today" | "week" | "month";
  label: string;
  /** Render-ready string e.g. "৳18,640" — UI never formats numbers. */
  value: string;
  /** Sub-caption (e.g. "+12% vs yesterday"). */
  caption: string;
  /** Drives the icon-badge tint. */
  tone: "red" | "blue" | "yellow";
};

/**
 * 3 cards (Today / This Week / This Month). The Earnings API isn't
 * wired to the database yet, so values are zeroed out and the
 * captions reflect an honest "no data" state. Swap to a real fetch
 * (the same one that powers the dashboard's revenue card) when the
 * API lands.
 */
export const earningsSummary: SummaryCardData[] = [
  {
    id: "today",
    label: "Today's Earnings",
    value: "৳0",
    caption: "No earnings yet",
    tone: "red",
  },
  {
    id: "week",
    label: "This Week",
    value: "৳0",
    caption: "No earnings yet",
    tone: "blue",
  },
  {
    id: "month",
    label: "This Month",
    value: "৳0",
    caption: "No earnings yet",
    tone: "yellow",
  },
];

/** Used by the chart's x-axis labels. Keep deterministic so SSR + client agree. */
export type RevenuePoint = {
  /** ISO date string "2025-04-12" — day-by-day, oldest first. */
  date: string;
  /** Display label "12 Apr". */
  label: string;
  /** BDT amount (number). The chart formats with `৳{value}`. */
  amount: number;
};

/**
/**
 * The revenue chart isn't backed by a real API yet, so the daily
 * series is empty — `RevenueChart` renders an empty-state instead of
 * a chart full of fake numbers.
 */
export const dailyRevenue: RevenuePoint[] = [];
/* -------------------------------------------------------------------------- */
/*  Transactions                                                              */
/* -------------------------------------------------------------------------- */

export type TransactionStatus = "paid" | "pending";

export type Transaction = {
  id: string;
  /** "12 Apr 2025" display string. */
  date: string;
  /** Short order id shown in the table (#KD-8421). */
  orderId: string;
  amount: string;
  status: TransactionStatus;
};

/**
 * The earnings API isn't wired to the database yet, so the recent
 * transactions list is empty — the `TransactionsTable` component
 * renders an empty-state instead of fake order ids and amounts.
 */
export const transactions: Transaction[] = [];
/* -------------------------------------------------------------------------- */
/*  Payout                                                                    */
/* -------------------------------------------------------------------------- */

export type PayoutAccount = {
  provider: string;
  /** "Bank Asia PLC" or "bKash Personal". */
  accountName: string;
  /** "*** 4421" / "+880 1711-005142". */
  identifier: string;
  /** Pre-formatted balance available to withdraw. */
  availableBalance: string;
  /** Two-cycle withdrawal schedule. */
  nextPayoutDate: string;
};

/**
 * Payout account isn't wired yet — the demo data (bKash / Tanvir) has
 * been removed. `PayoutDetails` renders an empty state until a real
 * payout-account model is added to the backend.
 */
export const payoutAccount: PayoutAccount = {
  provider: "Not configured",
  accountName: "",
  identifier: "",
  availableBalance: "৳0",
  nextPayoutDate: "—",
};
