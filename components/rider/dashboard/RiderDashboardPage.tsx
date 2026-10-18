"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { RiderDashboardHeader } from "@/components/rider/dashboard/RiderDashboardHeader";
import { RiderStatusCard } from "@/components/rider/dashboard/RiderStatusCard";
import { TodaySummaryCard } from "@/components/rider/dashboard/TodaySummaryCard";
import { initialTodaySummary, type TodaySummary } from "@/data/rider-dashboard";
import { apiFetch } from "@/lib/apiClient";
import { useOrdersFeed, refreshOrdersFeed } from "@/lib/useOrdersFeed";
import { useRiderLocationTracking } from "@/lib/useRiderLocationTracking";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import { formatHoursMinutes } from "@/lib/rider-hours-format";
import { useT } from "@/lib/i18n/LocaleProvider";

// Lazy-load the map picker (Leaflet) only when the dashboard
// actually needs the blocking modal — keeps the small dashboard
// page bundle a tad lighter.
const RiderZonePicker = dynamic(
  () =>
    import("@/components/rider/dashboard/RiderZonePicker").then(
      (m) => m.RiderZonePicker,
    ),
  { ssr: false, loading: () => null },
);

/**
 * Wire shape — slimmer than the full OrderApi. The dashboard only
 * needs the bare minimum to render the request card.
 *
 * Every field is optional so a server-side regression (missing
 * restaurant.address, etc.) never blows up the page; the renderers
 * degrade to empty strings instead.
 */
type WireOrder = {
  id: string;
  status?: import("@/lib/orders").OrderStatusApi;
  restaurant?: { name?: string; address?: string; phone?: string | null };
  customer?: { name?: string; phone?: string | null };
  deliveryAddress?: string;
  items?: Array<{ name?: string; qty?: number }>;
  total?: number;
  /** Rider-share snapshot taken at order-create time. Optional
   *  for legacy rows; fall back to a heuristic when missing. */
  riderEarning?: number | null;
  placedAt?: string;
  /** ISO timestamp the dispatch offer expires. Only set on
   *  pending-offers poll responses. */
  deadline?: string | null;
};

type RiderOrder = {
  id: string;
  shortId: string;
  pickupName: string;
  pickupAddress: string;
  dropoffName: string;
  dropoffAddress: string;
  /** Synthesised ETA string — we don't have real map data. */
  distance: string;
  eta: string;
  earnings: string;
  /** ISO timestamp the offer expires. The request card shows a
   *  countdown when this is set. */
  deadline?: string | null;
  itemSummary: string;
  /**
   * Optional contact numbers — kept optional because the dashboard
   * only surfaces them in the active-delivery page, not on the
   * request card itself.
   */
  restaurantPhone?: string;
  customerPhone?: string;
  /** Item breakdown — empty when the API didn't enrich the order. */
  items: { name: string; qty: number }[];
};

const POLL_INTERVAL_MS = 8000;

/* -------------------------------------------------------------------------- */
/*  Mapping                                                                   */
/* -------------------------------------------------------------------------- */

/** Defensive mapper — every field has a fallback so a partial server
 *  response still renders instead of throwing inside React. */
function wireToRiderOrder(o: WireOrder): RiderOrder {
  const id = o.id ?? "";
  const safeNum = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;
  const safeStr = (s: unknown, fallback = ""): string =>
    typeof s === "string" ? s : fallback;
  const items = Array.isArray(o.items) ? o.items : [];
  const total = safeNum(o.total);
  return {
    id,
    shortId: id ? `#KD-${id.slice(-4).toUpperCase()}` : "#KD-0000",
    pickupName: safeStr(o.restaurant?.name, "Restaurant"),
    pickupAddress: safeStr(o.restaurant?.address, "Pickup address pending"),
    dropoffName: safeStr(o.customer?.name, "Customer"),
    dropoffAddress: safeStr(o.deliveryAddress, "Delivery address pending"),
    // Heuristic ETA/distance — we don't have a real geocoder yet.
    distance: "2.4 km",
    eta: "15 min",
    // Real rider share from the order snapshot. Falls back to the
    // legacy 8% heuristic only when the snapshot is missing (older
    // rows predating the riderEarning migration).
    earnings:
      typeof o.riderEarning === "number"
        ? formatTaka(o.riderEarning)
        : formatTaka(Math.round(total * 0.08)),
    itemSummary: `${items.reduce((s, i) => s + safeNum(i.qty), 0)} item${
      items.length === 1 ? "" : "s"
    }`,
    restaurantPhone: safeStr(o.restaurant?.phone, ""),
    customerPhone: safeStr(o.customer?.phone, ""),
    items: items.map((i) => ({
      name: safeStr(i.name, "Item"),
      qty: safeNum(i.qty),
    })),
    deadline:
      typeof o.deadline === "string"
        ? o.deadline
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Summary derivation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Build a `TodaySummary` from the rider's full order list.
 *
 *   • Counts only orders the rider actually delivered today
 *     (`status === "delivered"` with a same-day `placedAt`).
 *   • Earnings = sum of `riderEarning` snapshot on each delivered
 *     order (set when the order was created). Older rows were
 *     backfilled at deploy time via `seed-delivery-config.mjs`.
 *   • "Hours online" is computed from `RiderOnlineSession` rows —
 *     passed in by the dashboard orchestrator so the read is
 *     already cached.
 */
function buildTodaySummary(
  orders: WireOrder[],
  onlineSeconds: number,
  now: Date = new Date(),
): TodaySummary {
  const safeNum = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const deliveredToday = orders.filter((o) => {
    if (o?.status !== "delivered") return false;
    const placed = o.placedAt ? new Date(o.placedAt) : null;
    return placed !== null && placed >= startOfToday;
  });

  const earnings = deliveredToday.reduce((sum, o) => {
    const earn = o.riderEarning;
    if (typeof earn === "number" && Number.isFinite(earn)) {
      return sum + earn;
    }
    // Backfill safety: orders predating the riderEarning
    // snapshot still need a number so the dashboard doesn't
    // regress on the rare read. Mirrors the legacy 8% fallback
    // that was here before.
    return sum + safeNum(o.total) * 0.08;
  }, 0);

  return {
    deliveries: deliveredToday.length,
    earnings: formatTaka(Math.round(earnings)),
    hoursOnline: formatHoursMinutes(onlineSeconds),
    // `headline` is rendered by `TodaySummaryCard` from
    // `rider.dashboard.summary.deliveriesCount_*` so it can switch
    // between English and Bangla. Keeping the key here as an empty
    // string preserves the legacy `TodaySummary` shape for any
    // older callers without forcing them to translate.
    headline: "",
  };
}

/* -------------------------------------------------------------------------- */
/*  Page orchestrator                                                          */
/* -------------------------------------------------------------------------- */

/**
 * /rider/dashboard orchestrator.
 *
 *   • Online state lives on the SERVER — toggled via the header
 *     switch which calls POST /api/riders/status. The page reads
 *     `isOnline` from /api/riders/me on mount, so a page refresh
 *     keeps the rider online.
 *   • While online, polls `/api/orders` every 8s for incoming
 *     offers; offline the dashboard drops to an "you're offline"
 *     empty state and stops polling.
 *   • Service zone is a hard requirement. If the rider has not
 *     picked a zone yet, the dashboard shows a blocking modal that
 *     explains why and how to fix it; the toggle is disabled in
 *     that state.
 *   • Accept navigates to /rider/delivery/{id}; Decline POSTs
 *     /api/orders/{id}/dispatch so the next rider is offered
 *     immediately.
 *   • Today's summary card now reads `Order.riderEarning` from
 *     each delivered order (snapshotted server-side at create)
 *     and pulls today's "Hours online" from the
 *     `RiderOnlineSession` table.
 *   • The fetch loop is isolated in a `try/catch` so a thrown
 *     network exception can never crash the page; the same applies
 *     to the mapper (`wireToRiderOrder` always returns a valid
 *     `RiderOrder`).
 */

type RiderMe = {
  isOnline: boolean;
  zone: {
    lat: number;
    lng: number;
    radiusKm: number;
    address: string;
  } | null;
  /** ধাপ ৫ — admin verification gate. Defaults to "APPROVED" so
   *  existing riders (and the demo data) keep working without an
   *  admin review pass. */
  verificationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
};

export function RiderDashboardPage() {
  const router = useRouter();
  const t = useT();
  // `null` until the first /api/riders/me resolves — see
  // `initialLoaded`/`me` further down. While `me === null` we
  // render a disabled toggle so the rider can't flip a
  // half-loaded profile into online state.
  const [me, setMe] = useState<RiderMe | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [online, setOnline] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  // True while the rider has not picked a service zone yet — we
  // show a blocking modal and disable the toggle.
  const [zoneMissing, setZoneMissing] = useState(false);
  // ধাপ ৫ — admin verification status. PENDING / REJECTED riders
  // can't go online; we surface a banner + block the toggle just
  // like the zone-missing modal (but the banner is informational,
  // not blocking — the rider can still navigate around).
  const [verificationStatus, setVerificationStatus] = useState<
    "PENDING" | "APPROVED" | "REJECTED"
  >("APPROVED");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  // Toast for a failed toggle (revert + show error briefly).
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Live-tracking bridge — only the location updates come from
  // this hook; the `isOnline` flag lives in `/api/riders/status`
  // and is toggled explicitly below.
  useRiderLocationTracking(online);

  // Load `/api/riders/me` once on mount. The "previous build" hard-
  // coded `useState(false)` so the dashboard always opened Offline,
  // and the only "real" online state was whatever the user just
  // tapped. Both issues get fixed here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<{ rider: RiderMe }>("/api/riders/me");
      if (cancelled) return;
      if (!res.ok) {
        // Fall back to default state; the toggle stays disabled
        // so the rider can't act on stale info.
        setToggleError(
          res.status === 401
            ? t("rider.dashboard.toggleErrors.sessionExpired")
            : `${t("rider.dashboard.toggleErrors.couldntLoad")} ${res.error.message}`,
        );
        setMeLoaded(true);
        return;
      }
      const r = res.data?.rider ?? null;
      setMe(r);
      setOnline(r?.isOnline ?? false);
      setZoneMissing(r?.zone === null);
      setVerificationStatus(r?.verificationStatus ?? "APPROVED");
      setRejectionReason(r?.rejectionReason ?? null);
      setMeLoaded(true);
    })().catch((err) => {
      if (cancelled) return;
      setToggleError(
        err instanceof Error
          ? err.message
          : t("rider.dashboard.toggleErrors.loadFailed"),
      );
      setMeLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle handler — posts to /api/riders/status first, then
  // updates local state. On failure we revert + show an error.
  const handleToggleOnline = useCallback(
    async (next: boolean) => {
      if (toggleBusy) return;
      setToggleBusy(true);
      const previous = online;
      // Optimistic local update so the UI feels snappy. Revert
      // on failure below.
      setOnline(next);
      setToggleError(null);
      try {
        const res = await apiFetch<{ isOnline: boolean; zone: RiderMe["zone"] }>(
          "/api/riders/status",
          { method: "POST", body: JSON.stringify({ online: next }) },
        );
        if (!res.ok) {
          setOnline(previous);
          setToggleError(res.error.message);
        } else if (res.data) {
          const z = res.data.zone;
          setZoneMissing(z === null);
          setOnline(res.data.isOnline);
          if (res.data.isOnline && z === null) {
            // Defensive: server should have rejected this already.
            setToggleError(
              t("rider.dashboard.toggleErrors.setZoneFirst"),
            );
          }
        }
      } catch (err) {
        setOnline(previous);
        setToggleError(
          err instanceof Error
            ? err.message
            : t("rider.dashboard.toggleErrors.updateFailed"),
        );
      } finally {
        setToggleBusy(false);
      }
    },
    [toggleBusy, online],
  );

  // Called by the ZonePicker's onSaved — clears the blocking
  // modal state and refreshes the rider profile.
  const handleZoneSaved = useCallback(
    (zone: RiderMe["zone"]) => {
      setMe((prev) => (prev ? { ...prev, zone } : { isOnline: false, zone }));
      setZoneMissing(zone === null);
    },
    [],
  );

  const [pool, setPool] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [onlineSeconds, setOnlineSeconds] = useState(0);

  // Pull "today's hours online" so the summary card can show real
  // data instead of the previous "—". The endpoint quietly closes
  // stale sessions before computing, so the number stays accurate
  // even after a tab is closed mid-shift.
  const refreshOnlineSeconds = useCallback(async () => {
    const res = await apiFetch<{ seconds: number }>(
      "/api/riders/hours/today",
    );
    if (res.ok && res.data) {
      setOnlineSeconds(res.data.seconds);
    }
  }, []);
  useEffect(() => {
    void refreshOnlineSeconds();
    // Re-poll every minute so the dashboard counter stays current
    // without a page refresh.
    const id = setInterval(refreshOnlineSeconds, 60_000);
    return () => clearInterval(id);
  }, [refreshOnlineSeconds]);
  const [error, setError] = useState<string | null>(null);

  // Shared RIDER orders feed — one /api/orders polling cycle per
  // tab, shared by the dashboard, history page and earnings page.
  const ordersFeed = useOrdersFeed("RIDER");
  const orders = ordersFeed.orders;

  /**
   * Single poll. Only `/api/orders/pending-offers` is dashboard-owned
   * now — the orders list is read from the shared feed (see
   * `useOrdersFeed("RIDER")` above), so the dashboard, history and
   * earnings pages all stay in sync without three parallel polls.
   */
  const reload = useCallback(async () => {
    try {
      const offersRes = await apiFetch<{ offers?: WireOrder[] }>(
        "/api/orders/pending-offers",
      );
      if (!offersRes.ok) {
        setError(offersRes.error.message);
        setLoading(false);
        return;
      }
      setError(null);
      const offers = Array.isArray(offersRes.data?.offers)
        ? offersRes.data.offers
        : [];
      // Surface the soonest-to-expire offer first so the rider
      // sees the most urgent one at the top of the card stack.
      const sorted = [...offers].sort((a, b) => {
        const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return ad - bd;
      });
      setPool(sorted.map(wireToRiderOrder));
      // Nudge the shared feed too so any concurrent subscriber sees
      // the new dispatch result without waiting for the next tick.
      void refreshOrdersFeed("RIDER");
    } catch (err) {
      // Catch-all so an unexpected runtime error (e.g. the API
      // returning a non-array body) doesn't crash the tree.
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling loop with proper cleanup. Tracks the active timer in a ref
  // so re-renders never create duplicate timers. The `cancelled` flag
  // is captured per-effect so StrictMode double-invoke can't let an
  // old timer fire after the new one is set up.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!online) {
      // Going offline cancels the next tick. Also flush loading so
      // the skeleton doesn't stick around after the rider flips off.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await reload();
      if (cancelled) return;
      timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    // Kick off immediately so the rider sees fresh data on the
    // very first frame after going online.
    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [online, reload]);

  const current = online && pool.length > 0 ? pool[0] : null;
  const hasMore = pool.length > 1;

  // Feat 1 — list the rider's active deliveries. With multiple
  // concurrent deliveries allowed (up to MAX_CONCURRENT_DELIVERIES
  // = 3 server-side), the dashboard needs to surface all of them
  // so the rider can jump into any one's delivery page. The
  // shared orders feed already returns every order where the
  // rider is involved, so a single .filter is enough — no extra
  // round-trip.
  const activeDeliveries = orders.filter((o) => {
    if (!o || !o.id) return false;
    const s = o.status;
    // Feat 1 — dispatch-on-accept stamps `riderId` at PREPARING, so
    // the rider sees a "Waiting for food" card on the dashboard
    // until the partner marks the order READY. The rider's
    // dashboard counts PREPARING (with riderId=self) as an active
    // delivery too, alongside the legacy OFFERED_TO_RIDER /
    // PICKED_UP / ON_THE_WAY states.
    return (
      s === "offered_to_rider" ||
      s === "preparing" ||
      s === "ready" ||
      s === "picked_up" ||
      s === "on_the_way"
    );
  });
  const statusById = new Map(
    activeDeliveries.map((o) => [o.id, o.status]),
  );

  // When the visible offer's countdown reaches zero, fire-and-forget
  // a dispatch call so the server moves our riderId into
  // dispatchedRiders and offers the order to the next rider.
  // Without this, the rider would have to manually hit Decline.
  useEffect(() => {
    if (!current?.deadline) return;
    const ms = new Date(current.deadline).getTime() - Date.now();
    if (ms <= 0) {
      // Already expired — fire now.
      void apiFetch(`/api/orders/${current.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ action: "reject" }),
      })
        .then(() => reload())
        .catch(() => reload());
      return;
    }
    const t = setTimeout(() => {
      void apiFetch(`/api/orders/${current.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ action: "reject" }),
      })
        .then(() => reload())
        .catch(() => reload());
    }, ms + 250); // +250ms slack so the countdown UI has already shown "0s"
    return () => clearTimeout(t);
  }, [current?.id, current?.deadline, reload]);

  const handleAccept = useCallback(
    (id: string) => {
      if (!id) return;
      setAcceptingId(id);
      // Accepting doesn't flip status — the rider still has to tap
      // "Receive" on the delivery page to flip to PICKED_UP (Feat 1
      // — order-flow restructure). Leaving the order at its
      // current status means dispatch won't re-offer it to anyone
      // else, while still letting the rider tap "Receive" to PATCH
      // it to PICKED_UP. Works for the legacy OFFERED_TO_RIDER
      // status and the new PREPARING + riderId path.
      router.push(`/rider/delivery/${id}`);
      setAcceptingId(null);
    },
    [router],
  );

  const handleDecline = useCallback(
    (id: string) => {
      if (!id) return;
      // Locally pop so the card animates out immediately, then call
      // /api/orders/{id}/dispatch with { action: "reject" } so the
      // server moves this riderId into dispatchedRiders + picks the
      // next rider. The new offer surfaces on the next poll (~3s).
      setPool((prev) => prev.filter((r) => r.id !== id));
      void apiFetch(`/api/orders/${id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ action: "reject" }),
      })
        .then(async () => {
          await reload();
        })
        .catch((err) => {
          setError(
            err instanceof Error
              ? err.message
              : t("rider.dashboard.toggleErrors.declineFailed"),
          );
          // Still reload — the offer might be gone server-side
          // already (e.g. timed out while we were typing).
          void reload();
        });
    },
    [reload],
  );

  return (
    <RequireAuth role="RIDER">
      <RiderShell
        activeKey="home"
        online={online}
        onToggleOnline={handleToggleOnline}
        onlineToggleDisabled={
          !meLoaded ||
          zoneMissing ||
          // ধাপ ৫ — gate the toggle on verification status. We
          // keep the rider's `online` UI state for "go offline"
          // so they can recover from a stale online flag.
          verificationStatus !== "APPROVED"
        }
      >
          <RiderDashboardHeader
            online={online}
            onToggleOnline={handleToggleOnline}
            disabled={
              !meLoaded ||
              zoneMissing ||
              // ধাপ ৫ — gate the toggle on verification status. We
              // keep the rider's `online` UI state for "go offline"
              // so they can recover from a stale online flag.
              verificationStatus !== "APPROVED"
            }
          />

          {meLoaded && verificationStatus !== "APPROVED" ? (
            <RiderVerificationBanner
              status={verificationStatus}
              rejectionReason={rejectionReason}
            />
          ) : null}

          <div className="flex flex-1 flex-col gap-6 p-8">
            {toggleError ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
              >
                {toggleError}
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
              >
                {t("rider.dashboard.toggleErrors.ordersRefreshFailed")} {error}
              </div>
            ) : null}
            <RiderStatusCard
              online={online}
              request={current}
              onAccept={handleAccept}
              onDecline={handleDecline}
              hasMoreRequests={hasMore}
              loading={loading && online}
              acceptingId={acceptingId}
              deadline={current?.deadline ?? null}
            />

            {/* Feat 1 — list every active delivery so the rider can
                jump into the right delivery page when running a
                small batch. With MAX_CONCURRENT_DELIVERIES = 3 a
                rider can hold a few in parallel; this surfaces all
                of them in one stack instead of forcing them to
                remember each id. */}
            {activeDeliveries.length > 0 ? (
              <ActiveDeliveriesList
                deliveries={activeDeliveries.map(wireToRiderOrder)}
                statusById={statusById}
                onOpen={(id) => router.push(`/rider/delivery/${id}`)}
              />
            ) : null}

            <TodaySummaryCard
              summary={buildTodaySummary(orders, onlineSeconds)}
            />
          </div>
      </RiderShell>

      {/* Blocking modal — visible only when the rider hasn't picked a
          service zone yet. ESC is intentionally NOT closable; the
          toggle is disabled until they save a zone. */}
      {zoneMissing && meLoaded ? (
        <ZoneBlockingModal onSaved={handleZoneSaved} />
      ) : null}
    </RequireAuth>
  );
}

/**
 * Dashboard-level modal that pins a rider who hasn't set their
 * service zone yet. The modal cannot be dismissed without picking
 * a location.
 */
function ZoneBlockingModal({
  onSaved,
}: {
  onSaved: (zone: {
    lat: number;
    lng: number;
    radiusKm: number;
    address: string;
  }) => void;
}) {
  const t = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("rider.dashboard.zoneMissingAria")}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4"
    >
      <div className="w-full max-w-2xl rounded-card bg-white p-3 shadow-2xl">
        <RiderZonePicker
          onSaved={onSaved}
          title={t("rider.dashboard.zoneMissingTitle")}
          description={t("rider.dashboard.zoneMissingDescription")}
        />
      </div>
    </div>
  );
}

// Re-export so older test imports keep working.
// `initialTodaySummary` now lives in `@/data/rider-dashboard` as a
// zero-state factory the dashboard never uses — we always render the
// computed summary. We re-export it here purely for backward compat.
export { initialTodaySummary, type TodaySummary };

/**
 * ধাপ ৫ — Rider-facing admin verification banner.
 *
 * Rendered above the dashboard's main content when the rider's
 * verification status is anything other than APPROVED. Mirrors the
 * partner-side banner in style so the design language stays
 * consistent across portals.
 */
function RiderVerificationBanner({
  status,
  rejectionReason,
}: {
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
}) {
  const t = useT();
  if (status === "PENDING") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900"
      >
        <div className="mt-0.5 shrink-0 text-amber-600" aria-hidden>
          ⏳
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold leading-snug">
            {t("rider.dashboard.verificationPendingTitle")}
          </p>
          <p className="text-[13px] font-normal leading-snug text-amber-800">
            {t("rider.dashboard.verificationPendingBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900"
    >
      <div className="mt-0.5 shrink-0 text-rose-600" aria-hidden>
        ⚠️
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-semibold leading-snug">
          {t("rider.dashboard.verificationRejectedTitle")}
        </p>
        {rejectionReason ? (
          <p className="text-[13px] font-normal leading-snug text-rose-800">
            <span className="font-semibold">
              {t("rider.dashboard.verificationRejectedReason")}
            </span>{" "}
            {rejectionReason}
          </p>
        ) : null}
        <p className="text-[13px] font-normal leading-snug text-rose-800">
          {t("rider.dashboard.verificationRejectedFooter")}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Active deliveries list (Feat 1)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Card stack of every delivery the rider is currently working
 * on. Each row shows the short id, restaurant name, customer name,
 * earnings, the current status, and a CTA that navigates to
 * `/rider/delivery/[id]` so the rider can drive the order through
 * the rest of the lifecycle.
 */
function ActiveDeliveriesList({
  deliveries,
  statusById,
  onOpen,
}: {
  deliveries: RiderOrder[];
  statusById: Map<string, string | undefined>;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  return (
    <section
      aria-label={t("rider.dashboard.activeTitle")}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5"
    >
      <header className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold text-ink">
          {t("rider.dashboard.activeTitle")} ({deliveries.length})
        </h2>
        <span className="text-[12px] font-medium text-ink-muted">
          {t("rider.dashboard.activeUpTo")}
        </span>
      </header>
      <ul className="flex flex-col gap-3">
        {deliveries.map((d) => {
          const status = statusById.get(d.id);
          return (
            <li
              key={d.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14px] font-bold text-ink">
                  {d.shortId} · {d.pickupName}
                </p>
                <p className="text-[12px] text-ink-muted">
                  {d.dropoffName} · ৳{d.earnings} · {d.distance}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#dbeafe] px-3 py-1 text-[12px] font-semibold text-[#3b82f6]">
                  {status === "offered_to_rider"
                    ? t("rider.dashboard.activeAwaiting")
                    : status === "preparing" || status === "ready"
                      ? t("rider.dashboard.activeWaitingForFood")
                      : status === "picked_up"
                        ? t("rider.dashboard.activePickedUp")
                        : t("rider.dashboard.activeOnTheWay")}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(d.id)}
                  className="inline-flex h-9 items-center rounded-xl bg-brand px-4 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                >
                  {t("rider.dashboard.activeOpen")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
