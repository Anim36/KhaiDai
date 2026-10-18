/**
 * Mock data for the partner dashboard page.
 *
 * Kept in /data (not /components) so the dashboard remains a pure UI
 * layer that owns only presentation + state mutations — the moment a
 * real API exists, swap this file's exports for fetches and nothing in
 * `components/partner/dashboard/*` needs to change.
 */

export type OrderStatus =
  | "new"
  | "preparing"
  | "ready"
  | "picked-up"
  | "delivered"
  | "cancelled";

export type IncomingOrder = {
  id: string;
  /** Short code shown in the order-id-block (e.g. "#KD-1234"). */
  shortId: string;
  /** Time the order came in, formatted "2:34 PM". */
  placedAt: string;
  /** Customer name + line-2 (phone/address excerpt). */
  customerName: string;
  customerSubtitle: string;
  /** Pre-formatted line summary, e.g. "2× Beef Burger, 1× Coke". */
  itemsSummary: string;
  /** Total amount in BDT, formatted "৳1,250". */
  total: string;
  status: OrderStatus;
};

/**
 * The dashboard's "Incoming Orders" panel reads from this list.
 *
 * The Order system isn't wired to the database yet, so the list is
 * intentionally empty — the panel renders an empty-state instead of
 * fake names/totals. The shape stays exported so the consuming
 * component (`OrdersPanel`) keeps a stable import while it migrates
 * to a real API.
 */
export const incomingOrders: IncomingOrder[] = [];

/**
 * Three metric cards matching the Figma spec:
 *   - Today's Orders  → Clock icon, blue badge tint
 *   - Today's Revenue → Wallet icon, brand-red badge tint
 *   - Average Rating  → Star icon, yellow badge tint
 *
 * Order / Revenue / Rating APIs don't exist yet, so values are
 * intentionally zeroed out. The `tone` field drives the icon-badge
 * tint colour, so swapping to a real analytics endpoint is a
 * one-prop change when those APIs land.
 */
export type MetricCardData = {
  id: string;
  label: string;
  value: string;
  /** Short caption below the value (e.g. "No orders yet"). */
  caption: string;
  /** "blue" | "red" | "yellow" — drives the icon badge tint colour. */
  tone: "blue" | "red" | "yellow";
};

export const metricCards: MetricCardData[] = [
  {
    id: "orders",
    label: "Today's Orders",
    value: "0",
    caption: "No orders yet",
    tone: "blue",
  },
  {
    id: "revenue",
    label: "Today's Revenue",
    value: "৳0",
    caption: "No earnings yet",
    tone: "red",
  },
  {
    id: "rating",
    label: "Average Rating",
    value: "0.0 / 5",
    caption: "No reviews yet",
    tone: "yellow",
  },
];


/* --------------------------------------------------------------------------
 * The hardcoded `partnerProfile` block (Tanvir / Spice Junction) was
 * removed: the sidebar now reads the signed-in user via `useAuth()`,
 * so no static demo profile is needed here.
 * ------------------------------------------------------------------------ */



/**
 * Status pill display metadata — colour mapping matches the Figma
 * `status-pill` colours exactly. Centralising this here keeps the
 * StatusPill component pure-presentation and lets future code add a
 * new status by editing just this file.
 */
export const orderStatusMeta: Record<
  OrderStatus,
  { labelKey: string; classes: { bg: string; text: string } }
> = {
  new: {
    labelKey: "partner.dashboard.status.new",
    classes: { bg: "bg-[#ffebe8]", text: "text-brand" },
  },
  preparing: {
    labelKey: "partner.dashboard.status.preparing",
    classes: { bg: "bg-[#dbeafe]", text: "text-[#3b82f6]" },
  },
  ready: {
    labelKey: "partner.dashboard.status.ready",
    classes: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
  },
  "picked-up": {
    labelKey: "partner.dashboard.status.onTheWay",
    classes: { bg: "bg-[#f9fafb]", text: "text-ink-muted" },
  },
  delivered: {
    labelKey: "partner.dashboard.status.delivered",
    classes: { bg: "bg-[#f9fafb]", text: "text-ink-muted" },
  },
  cancelled: {
    labelKey: "partner.dashboard.status.cancelled",
    classes: { bg: "bg-[#fef2f2]", text: "text-rose-500" },
  },
};
