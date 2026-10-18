"use client";

import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { HistoryStatusTabs } from "@/components/rider/history/HistoryStatusTabs";
import { TripHistoryCard } from "@/components/rider/history/TripHistoryCard";
import { TripDetailModal } from "@/components/rider/history/TripDetailModal";
import { RiderPageHeader } from "@/components/rider/dashboard/RiderPageHeader";
import { useOrdersFeed } from "@/lib/useOrdersFeed";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import { useT } from "@/lib/i18n/LocaleProvider";
import {
  filterTripsByTab,
  type CompletedTrip,
  type HistoryTabKey,
} from "@/data/rider-history";

/* -------------------------------------------------------------------------- */
/*  Wire shape + projection                                                    */
/* -------------------------------------------------------------------------- */

type WireOrder = {
  id?: string;
  status?: string;
  total?: number;
  placedAt?: string;
  deliveryAddress?: string;
  cancellationReason?: string;
  restaurant?: { id?: string; name?: string; address?: string };
  customer?: { id?: string; name?: string; phone?: string | null };
  rider?: { id?: string; name?: string; phone?: string | null } | null;
  items?: Array<{ name?: string; qty?: number }>;
};

/**
 * Map a server order into the local `CompletedTrip` shape.
 *
 *   • Distance / duration aren't returned by `/api/orders` yet —
 *     they fall back to "—" so the table still renders cleanly.
 *   • The payment method is approximated from the totals: a `0`
 *     subtotal is treated as "Cash" (legacy demo data had this
 *     pattern); otherwise we default to "bKash" (the dominant
 *     wallet in the seeded data) until the API exposes a real
 *     `paymentMethod` column.
 *
 * Defensive: every field has a fallback so a partial server
 * response still renders instead of throwing.
 */
function wireToTrip(o: WireOrder): CompletedTrip {
  const safeStr = (s: unknown, fallback = ""): string =>
    typeof s === "string" && s.length > 0 ? s : fallback;
  const safeNum = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;

  const id = safeStr(o.id);
  const placedAt = safeStr(o.placedAt);
  const total = safeNum(o.total);
  const earnings = Math.round(total * 0.08); // matches dashboard heuristic
  const status: CompletedTrip["status"] =
    o.status === "cancelled" ? "cancelled" : "delivered";
  const payment: CompletedTrip["payment"] =
    total === 0 ? "Cash" : "bKash";

  return {
    id,
    shortId: id ? `#KD-${id.slice(-4).toUpperCase()}` : "#KD-0000",
    placedAt,
    placedAtLabel: placedAt
      ? new Date(placedAt).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "—",
    restaurant: safeStr(o.restaurant?.name, "Restaurant"),
    customer: safeStr(o.customer?.name, "Customer"),
    customerPhone: safeStr(o.customer?.phone, ""),
    customerAddress: safeStr(o.deliveryAddress, "Address pending"),
    distance: "—",
    duration: "—",
    earned: formatTaka(earnings),
    status,
    payment,
    cancellationReason: safeStr(o.cancellationReason, ""),
  };
}

/* -------------------------------------------------------------------------- */
/*  Page shell                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Orchestrator for /rider/history.
 *
 *   • Two-column shell: 260px sidebar (`activeKey="history"`) +
 *     flex-1 main column.
 *   • Header — same chrome as the other rider pages.
 *   • Body — status tabs + full list of completed trips.
 *
 * Data flow:
 *   • On mount the page hits `/api/orders` once and filters the
 *     result down to `delivered` + `cancelled` rows. No mock list
 *     is ever rendered.
 *
 * State machine:
 *   • `activeTab` — currently selected date filter.
 *   • `openTripId` — currently open trip in the detail modal.
 *     Modal is open iff this is non-null.
 *   • `loadError` — surfaces a friendly banner if `/api/orders`
 *     fails (network, 401, 500, …) so the page never crashes
 *     on an unhandled rejection.
 *
 * Counts — recomputed every render so the tab badges stay
 * accurate as the underlying data changes.
 */
export function RiderHistoryPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<HistoryTabKey>("all");
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<CompletedTrip[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Read from the shared RIDER feed so history + dashboard +
  // earnings all stay in sync without separate fetches.
  const feed = useOrdersFeed("RIDER");
  useEffect(() => {
    const finished: CompletedTrip[] = feed.orders
      .filter((o) => o?.status === "delivered" || o?.status === "cancelled")
      .map(wireToTrip);
    setTrips(finished);
    if (feed.error) setLoadError(feed.error);
    setLoaded(true);
  }, [feed.orders, feed.error]);

  const counts = useMemo<Record<HistoryTabKey, number>>(
    () => ({
      today: filterTripsByTab(trips, "today").length,
      week: filterTripsByTab(trips, "week").length,
      month: filterTripsByTab(trips, "month").length,
      all: trips.length,
    }),
    [trips],
  );

  const filtered = useMemo(
    () => filterTripsByTab(trips, activeTab),
    [trips, activeTab],
  );

  const openTrip = openTripId
    ? trips.find((t) => t.id === openTripId) ?? null
    : null;

  return (
    <RequireAuth role="RIDER">
      <RiderShell activeKey="history">
        <RiderPageHeader
          title={t("rider.history.headerTitle")}
          subtitle={t("rider.history.headerSubtitle")}
        />

        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {loadError ? (
            <div
              role="alert"
              className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700"
            >
              {t("rider.history.loadFailed", { msg: loadError })}
            </div>
          ) : null}

          <HistoryStatusTabs
            active={activeTab}
            counts={counts}
            onSelect={setActiveTab}
          />

          {loaded && trips.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <span className="font-display text-[16px] font-extrabold text-ink">
                {t("rider.history.emptyTitle")}
              </span>
              <p className="text-[13px] text-ink-muted">
                {t("rider.history.emptyBody")}
              </p>
            </div>
          ) : (
            <TripHistoryCard trips={filtered} onOpen={setOpenTripId} />
          )}
        </div>

        <TripDetailModal
          trip={openTrip}
          onClose={() => setOpenTripId(null)}
        />
      </RiderShell>
    </RequireAuth>
  );
}
