"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { DeliveryMap } from "@/components/rider/dashboard/DeliveryMap";
import { DeliveryStatusPanel } from "@/components/rider/dashboard/DeliveryStatusPanel";
import {
  DeliveryStatusAction,
  stages,
  type DeliveryStage,
} from "@/components/rider/dashboard/DeliveryStatusAction";
import { BellIcon, RiderScooterIcon } from "@/components/icons";
import { OrderChatPanel } from "@/components/orders/OrderChatPanel";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Wire shape + UI projection                                                */
/* -------------------------------------------------------------------------- */

/**
 * Server response shape — every field is optional so a partial
 * response (e.g. a future server-side regression that drops
 * `rider.phone`) doesn't crash the page. The mapper below always
 * produces a fully populated `DeliveryRequest`.
 */
type WireOrder = {
  id?: string;
  status?: import("@/lib/orders").OrderStatusApi;
  restaurant?: {
    id?: string;
    name?: string;
    address?: string;
    phone?: string | null;
  };
  customer?: { id?: string; name?: string; phone?: string | null };
  rider?: { id?: string; name?: string; phone?: string | null } | null;
  items?: Array<{ name?: string; qty?: number }>;
  deliveryAddress?: string;
  /** Feat 2 — customer's optional delivery note. */
  specialInstructions?: string | null;
};

type DeliveryRequest = {
  id: string;
  shortId: string;
  pickupName: string;
  pickupAddress: string;
  dropoffName: string;
  dropoffAddress: string;
  distance: string;
  eta: string;
  earnings: string;
  itemSummary: string;
  restaurantPhone?: string;
  customerPhone?: string;
  items: Array<{ name: string; qty: number }>;
  dropoffEta: string;
  /** Feat 2 — surfaced next to the drop-off block. */
  specialInstructions?: string | null;
};

const safeStr = (s: unknown, fallback = ""): string =>
  typeof s === "string" && s.length > 0 ? s : fallback;
const safeNum = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

function wireToDeliveryRequest(o: WireOrder): DeliveryRequest {
  const id = safeStr(o.id);
  const items = Array.isArray(o.items) ? o.items : [];
  const normalisedItems = items.map((i) => ({
    name: safeStr(i.name, "Item"),
    qty: safeNum(i.qty),
  }));
  return {
    id,
    shortId: id ? `#KD-${id.slice(-4).toUpperCase()}` : "#KD-0000",
    pickupName: safeStr(o.restaurant?.name, "Restaurant"),
    pickupAddress: safeStr(o.restaurant?.address, "Pickup address pending"),
    dropoffName: safeStr(o.customer?.name, "Customer"),
    dropoffAddress: safeStr(o.deliveryAddress, "Delivery address pending"),
    distance: "2.4 km",
    eta: "15 min",
    earnings: "৳120",
    itemSummary: `${normalisedItems.reduce((s, i) => s + i.qty, 0)} item${
      normalisedItems.length === 1 ? "" : "s"
    }`,
    restaurantPhone: safeStr(o.restaurant?.phone, "") || undefined,
    customerPhone: safeStr(o.customer?.phone, "") || undefined,
    items: normalisedItems,
    dropoffEta: "12:54 PM",
    specialInstructions:
      typeof o.specialInstructions === "string"
        ? o.specialInstructions
        : null,
  };
}

/**
 * Map the DB/API order status into the 3-stage UI.
 *
 *   preparing / ready / offered_to_rider / picked_up
 *     → awaiting_pickup (rider still needs to tap Receive)
 *   on_the_way
 *     → en_route (rider on the way; next action is "On the way"
 *       which PATCHes the row to on_the_way — i.e. this stage
 *       represents the rider's CURRENT location in the workflow,
 *       not the action they just took).
 *   delivered
 *     → delivered (terminal)
 *
 * Bug 4 — earlier builds mapped `picked_up → awaiting_pickup`
 * which left the Receive button visible after the rider had
 * already received the food; a stray click (or the 5 s poll
 * re-applying the same state) sent a duplicate PATCH and the
 * server returned 400 "Cannot transition picked_up → picked_up".
 * The mapping now puts `picked_up` on the next UI step so the
 * Receive CTA is gone.
 */
function apiStatusToStage(
  s: WireOrder["status"],
): DeliveryStage {
  switch (s) {
    case "offered_to_rider":
    case "preparing":
    case "ready":
      // Feat 1 dispatch-on-accept: riderId is stamped at
      // PREPARING, so the rider sees the order as "Waiting for
      // food" until the partner "Mark Ready"s. The Receive CTA
      // is enabled throughout because PATCHing to PICKED_UP from
      // any of these statuses is allowed by the transition graph.
      return "awaiting_pickup";
    case "picked_up":
      // The rider has already received the food. The next
      // action is "On the way" — map to `en_route`.
      return "en_route";
    case "on_the_way":
      return "en_route";
    case "delivered":
      return "delivered";
    default:
      // If a rider opens this page from a non-active order (e.g.
      // the server hasn't observed an accept yet) default to the
      // first stage so the UI still renders.
      return "awaiting_pickup";
  }
}

/**
 * Map a UI stage back to the API status PATCH we need to send.
 */
function stageToApiStatus(s: DeliveryStage): "picked_up" | "on_the_way" | "delivered" {
  switch (s) {
    case "awaiting_pickup":
      return "picked_up";
    case "en_route":
      return "on_the_way";
    case "delivered":
      return "delivered";
  }
}

/* -------------------------------------------------------------------------- */
/*  Orchestrator                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Orchestrator for `/rider/delivery/[id]`.
 *
 *   • Loads the order on mount via GET `/api/orders/[id]`.
 *   • Derives the 3-stage UI (`awaiting_pickup` / `en_route` /
 *     `delivered`) from the API status.
 *   • The "Mark as Delivered" CTA calls PATCH `/api/orders/[id]`
 *     `{ status: "delivered" }` and pushes the rider back to the
 *     dashboard on success.
 *   • Polls every 5 s while the page is open so an external change
 *     (e.g. partner cancellation, customer refresh) shows up without
 *     a manual reload.
 *   • Every async path is `try/catch`-wrapped so an unexpected
 *     network/runtime error renders an inline error banner instead
 *     of crashing the whole tree.
 */
export function RiderDeliveryPage({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();
  const [request, setRequest] = useState<DeliveryRequest | null>(null);
  const [stage, setStage] = useState<DeliveryStage>("awaiting_pickup");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastStageRef = useRef<DeliveryStage>("awaiting_pickup");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await apiFetch<{ order?: WireOrder }>(`/api/orders/${id}`);
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      const order = res.data?.order;
      if (!order || !order.id) {
        setError(t("rider.dashboard.delivery.orderNotFound"));
        setLoading(false);
        return;
      }
      setRequest(wireToDeliveryRequest(order));
      const nextStage = apiStatusToStage(order.status);
      setStage((prev) => (prev === nextStage ? prev : nextStage));
      lastStageRef.current = nextStage;
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("rider.dashboard.delivery.loadingFailed"),
      );
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchOnce();
      if (cancelled) return;
      timerRef.current = setTimeout(tick, 5000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchOnce]);

  /**
   * Bug 1 fix — the DeliveryStatusAction forwards the CURRENT
   * stage (the one whose copy the user is looking at), not the
   * next one. We PATCH the server using `stageToApiStatus(stage)`
   * which already maps to the API status we transition TO, and
   * only flip the local stage forward on success. Previously the
   * CTA passed the next stage here, which made `stageToApiStatus`
   * produce the wrong API target (e.g. clicking "Confirm Pickup"
   * while in `awaiting_pickup` sent `PATCH on_the_way` instead of
   * `PATCH picked_up`).
   */
  // Bug 4 — defense-in-depth against double-submit. The
  // `<button disabled={submitting}>` already blocks rapid clicks
  // after React has flushed the state, but a fast double-tap on
  // touch devices can fire two click events before the first
  // `setSubmitting(true)` has re-rendered. A ref-based mutex
  // synchronously rejects the second call so the rider never
  // gets a "Cannot transition picked_up → picked_up" error.
  const advanceLockRef = useRef(false);
  const completeLockRef = useRef(false);

  const handleAdvance = async (currentStage: DeliveryStage) => {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    const nextStage =
      stages[stages.indexOf(currentStage) + 1] ?? currentStage;
    setStage(nextStage);
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: stageToApiStatus(currentStage) }),
      });
      if (!res.ok) {
        // Roll back the optimistic stage change.
        setStage(lastStageRef.current);
        setError(res.error.message);
        return;
      }
      await fetchOnce();
    } catch (err) {
      setStage(lastStageRef.current);
      setError(
        err instanceof Error
          ? err.message
          : t("rider.dashboard.delivery.updateFailed"),
      );
    } finally {
      setSubmitting(false);
      advanceLockRef.current = false;
    }
  };

  const handleComplete = async () => {
    if (completeLockRef.current) return;
    completeLockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "delivered" }),
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setToast(t("rider.dashboard.delivery.completedToast"));
      window.setTimeout(() => {
        router.push("/rider/dashboard");
      }, 900);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("rider.dashboard.delivery.completeFailed"),
      );
    } finally {
      setSubmitting(false);
      completeLockRef.current = false;
    }
  };

  if (loading) {
    return (
      <RequireAuth role="RIDER">
        <RiderShell activeKey="home">
          <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-6 lg:p-8">
            <p className="text-[14px] text-ink-muted">
              {t("rider.dashboard.delivery.loading")}
            </p>
          </div>
        </RiderShell>
      </RequireAuth>
    );
  }

  if (!request) {
    return <NotFoundState message={error} />;
  }

  return (
    <RequireAuth role="RIDER">
      <RiderShell activeKey="home">
        <DeliveryHeader request={request} toast={toast} />

        <div className="flex flex-1 flex-col gap-6 p-4 pb-32 sm:p-6 sm:pb-32 md:pb-8 lg:p-8">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"
            >
              {error}
            </div>
          ) : null}

          {/* Two-column body on md+, stacked on mobile. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.4fr_1fr]">
            <DeliveryMap request={request} stage={stage} />
            <DeliveryStatusPanel request={request} />
          </div>

          {/* Status action bar — sticky on mobile so the rider
              can advance the flow with their thumb without
              scrolling past the map / chat panel. Desktop renders
              inline (the same component handles both layouts). */}
          <DeliveryStatusAction
            stage={stage}
            onAdvance={handleAdvance}
            onComplete={handleComplete}
            disabled={submitting}
            variant="sticky"
          />

          {/* Feat 2 — chat with the customer. The panel renders
              a button first; on click it expands into the
              message list + input box. The server enforces the
              status gate. */}
          {user ? (
            <OrderChatPanel
              orderId={id}
              currentUserId={user.id}
              currentRole="RIDER"
              otherPartyName={request.dropoffName}
            />
          ) : null}
        </div>
      </RiderShell>
    </RequireAuth>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                    */
/* -------------------------------------------------------------------------- */

function DeliveryHeader({
  request,
  toast,
}: {
  request: DeliveryRequest;
  toast: string | null;
}) {
  const t = useT();
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex items-center gap-3 leading-normal">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff5f3] text-brand">
          <RiderScooterIcon size={20} />
        </span>
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            {t("rider.dashboard.delivery.headerTitle")}
          </h1>
          <p className="text-[13px] text-ink-muted">
            {t("rider.dashboard.delivery.headerOrderSub")} {request.shortId} · {request.distance} · {t("rider.dashboard.delivery.headerEta")}{" "}
            {request.dropoffEta ?? request.eta}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {toast ? (
          <span
            data-toast="success"
            className="inline-flex items-center gap-2 rounded-[20px] bg-[#dcfce7] px-3 py-2 text-[12px] font-semibold text-[#16a34a]"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#16a34a]" />
            {toast}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={t("rider.dashboard.delivery.notificationsAria")}
          className="flex h-10 w-10 items-center justify-center rounded-[20px] border border-line bg-white text-ink-muted transition-colors hover:text-ink"
        >
          <BellIcon size={18} />
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Unknown-id fallback                                                       */
/* -------------------------------------------------------------------------- */

function NotFoundState({ message }: { message: string | null }) {
  const t = useT();
  return (
    <RequireAuth role="RIDER">
      <RiderShell activeKey="home">
        <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-line bg-white p-6 sm:p-8 lg:p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff5f3] text-brand">
              <RiderScooterIcon size={22} />
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-ink">
              {t("rider.dashboard.delivery.notFoundTitle")}
            </h1>
            <p className="text-[14px] text-ink-muted">
              {message ?? t("rider.dashboard.delivery.notFoundBody")}
            </p>
            <Link
              href="/rider/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-[14px] font-semibold text-white hover:opacity-90"
            >
              {t("rider.dashboard.delivery.backToDashboard")}
            </Link>
          </div>
        </div>
      </RiderShell>
    </RequireAuth>
  );
}
