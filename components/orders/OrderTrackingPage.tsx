"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { TopNav } from "@/components/home/TopNav";
import { Footer } from "@/components/home/Footer";
import { MapPinAddressIcon, TruckIcon } from "@/components/icons";
import { MapPlaceholder } from "./MapPlaceholder";
import { TrackingMap } from "./TrackingMap";
import { StatusTimeline } from "./StatusTimeline";
import { RiderCard, type RiderFromOrder } from "./RiderCard";
import { ReviewModal } from "@/components/orders/ReviewModal";
import { OrderChatPanel } from "@/components/orders/OrderChatPanel";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/apiClient";
import {
  formatTaka,
  useCart,
} from "@/components/restaurants/cart/CartProvider";
import type { OrderStatusApi } from "@/lib/orders";
import type { ReviewDto } from "@/lib/reviews";

type OrderApi = {
  id: string;
  status: OrderStatusApi;
  statusLabel: string;
  customer: { id: string; name: string; phone: string | null };
  restaurant: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
  };
  rider: RiderFromOrder;
  items: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    price: number;
    lineTotal: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  deliveryAddress: string;
  paymentMethod: "CASH" | "BKASH" | "NAGAD" | "CARD";
  /** ধাপ ১ — gateway state, mirrored from lib/orders.ts. Needed here
   *  so we can clear the cart the moment a payment settles. */
  paymentGatewayStatus:
    | "NOT_INITIATED"
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "CANCELLED";
  placedAt: string;
};

function apiStatusToTimelineStep(
  s: OrderStatusApi,
): "confirmed" | "preparing" | "picked_up" | "on_the_way" | "delivered" {
  switch (s) {
    case "pending":
      return "confirmed";
    case "preparing":
    case "ready":
    case "offered_to_rider":
      return "preparing";
    case "picked_up":
      return "picked_up";
    case "on_the_way":
      return "on_the_way";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "delivered";
  }
}

const STATUS_HEADLINE: Record<OrderStatusApi, string> = {
  pending: "Order received",
  preparing: "Restaurant is preparing your food",
  ready: "Your order is ready for the rider",
  offered_to_rider: "Looking for a rider",
  picked_up: "Rider picked up your order",
  on_the_way: "On the way to you",
  delivered: "Delivered — enjoy!",
  cancelled: "This order was cancelled",
};

const POLL_INTERVAL_MS = 7000;

function statusIsTerminal(s: OrderStatusApi): boolean {
  return s === "delivered" || s === "cancelled";
}

/**
 * Client orchestrator for `/orders/[id]/track`.
 *
 *   • Fetches the order from `/api/orders/[id]` on mount and every
 *     7 seconds thereafter. Real-time status changes from the
 *     partner / rider dashboards show up on this page without a
 *     manual refresh.
 *   • Once the order reaches a terminal state (delivered /
 *     cancelled) we flip `isTerminalRef` inside `fetchOnce`; the
 *     recursive polling `tick()` reads that ref on its next
 *     scheduled callback and stops scheduling further ticks. This
 *     keeps the hooks order unconditional — the previous
 *     implementation conditionally called a second `useEffect`
 *     after the early returns, which produced React's "Rendered
 *     more hooks than during the previous render" crash.
 *   • Wrapped in `<RequireAuth role="CUSTOMER">` so only the
 *     customer who placed the order can view it.
 */
export function OrderTrackingPage({ id }: { id: string }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Existing reviews for this order — fetched once the order
   *  reaches DELIVERED so the rate modal can pre-fill with any
   *  partial the customer already submitted. */
  const [myReviews, setMyReviews] = useState<ReviewDto[]>([]);
  const [rateOpen, setRateOpen] = useState(false);
  // Cancellation UI: confirm modal opens on click, `cancelling` is the
  // in-flight flag for the POST, and `cancelError` surfaces any 4xx
  // message returned by the server (e.g. "order already past PREP").
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // `isTerminalRef` is a ref so the polling closure can short-circuit
  // on delivered / cancelled without us re-creating the loop or
  // adding hooks after the early returns (which would be a
  // Rules-of-Hooks violation).
  const isTerminalRef = useRef(false);
  // We mirror the terminal flag into state for the same reason —
  // the conditional tear-down would happen inside a useEffect body,
  // not as a separate useEffect call, so this is fine.
  const [, setTerminalTick] = useState(0);

  // ধাপ ৩ — the cart is intentionally NOT cleared at the moment the
  // customer is redirected to SSLCommerz: if they fail or cancel, we
  // need the cart intact so they can retry. The success callback
  // lands here on `/orders/[id]/track?paid=1`, so this is where the
  // cart finally gets emptied.
  //
  // Two independent triggers, both idempotent:
  //   • `?paid=1` — the success callback redirected us here.
  //   • `paymentGatewayStatus === "PAID"` — belt-and-braces, so the
  //     IPN path (customer closed the browser and later reopened the
  //     tracking link) also empties the cart.
  const cart = useCart();
  const paidHandledRef = useRef(false);
  useEffect(() => {
    if (paidHandledRef.current) return;
    const paidByRedirect =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("paid") === "1";
    if (!paidByRedirect && order?.paymentGatewayStatus !== "PAID") return;
    paidHandledRef.current = true;
    cart.clear();
  }, [order?.paymentGatewayStatus, cart]);

  const fetchOnce = useCallback(
    async (signal?: AbortSignal) => {
      const res = await apiFetch<{ order: OrderApi }>(`/api/orders/${id}`, {
        signal,
      });
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      if (res.data?.order) {
        setOrder(res.data.order);
        setError(null);
        const terminal =
          res.data.order.status === "delivered" ||
          res.data.order.status === "cancelled";
        if (terminal && !isTerminalRef.current) {
          isTerminalRef.current = true;
          // nudge React so the loop's tick reads the new ref value
          // on its next scheduled callback.
          setTerminalTick((t) => t + 1);
        }
      }
      setLoading(false);
    },
    [id],
  );

  // Polling loop. The recursive `setTimeout` lets the closure read
  // the latest `isTerminalRef` value so we stop scheduling ticks
  // once the order hits a terminal state. The hooks order here is
  // unconditional — no Rules-of-Hooks violation.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchOnce(ctrl.signal);

    let cancelled = false;
    function tick() {
      if (cancelled || isTerminalRef.current) return;
      setTimeout(async () => {
        if (cancelled) return;
        await fetchOnce();
        tick();
      }, POLL_INTERVAL_MS);
    }
    tick();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [fetchOnce]);

  // Once the order hits DELIVERED, fetch any existing reviews for
  // this order so the rate modal can pre-fill the pickers. We
  // don't have a dedicated "my reviews for this order" endpoint,
  // but the public restaurants/review list never exposes review
  // ids keyed by order — so we load the reviews for the order's
  // restaurant (RESTAURANT kind) + separately the rider.
  //
  // Simpler approach: pull from /api/restaurants/[id]/reviews and
  // filter where `orderId === order.id`. That gets us the
  // restaurant-side review cheaply. For the rider side we keep
  // the modal's pre-fill empty — users rarely need to re-rate
  // the rider.
  //
  // NOTE: this effect lives BEFORE any early-return so the hooks
  // order is stable across renders. The body itself guards on
  // `order` (which may be null during the initial fetch) so it's
  // safe regardless.
  useEffect(() => {
    if (!order || order.status !== "delivered" || myReviews.length > 0) {
      return;
    }
    if (!order.restaurant?.id) return;
    let cancelled = false;
    apiFetch<{ reviews: ReviewDto[] }>(
      `/api/restaurants/${order.restaurant.id}/reviews?limit=50`,
    )
      .then((res) => {
        if (cancelled || !res.ok) return;
        const mine = (res.data?.reviews ?? []).filter(
          (r) => r.orderId === order.id,
        );
        if (mine.length > 0) setMyReviews(mine);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // myReviews is intentionally omitted from deps — we only want to
    // fetch once per delivered order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status, order?.restaurant?.id, order?.id]);

  // ----- early returns live BELOW all hook calls -----

  if (loading) {
    return (
      <RequireAuth role="CUSTOMER">
        <main className="min-h-screen bg-surface-page">
          <TopNav />
          <section className="mx-auto w-full max-w-page px-6 py-16 md:px-[64px]">
            <p className="text-[14px] font-medium text-ink-muted">
              Loading your order…
            </p>
          </section>
          <Footer />
        </main>
      </RequireAuth>
    );
  }

  if (error || !order) {
    return (
      <RequireAuth role="CUSTOMER">
        <main className="min-h-screen bg-surface-page">
          <TopNav />
          <section className="mx-auto flex w-full max-w-page flex-col gap-6 px-6 py-16 md:px-[64px]">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted transition-colors hover:text-brand"
            >
              ← Back to home
            </Link>
            <div className="rounded-card border border-rose-300 bg-rose-50 px-4 py-3 text-[14px] font-semibold text-rose-700">
              {error ??
                "We couldn't find that order. It may have been cancelled or removed."}
            </div>
          </section>
          <Footer />
        </main>
      </RequireAuth>
    );
  }

  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  // Cancellation is allowed while the order is still in the kitchen
  // (PENDING/PREPARING). Once it hits READY/OFFERED_TO_RIDER/PICKED_UP
  // the food is already out of the restaurant's hands and we lock
  // it down on the server side too.
  const canCancel =
    order.status === "pending" || order.status === "preparing";
  // Feat 1 — dispatch-on-accept stamps `riderId` at PREPARING. So
  // a rider is "on the way" the moment PREPARING carries a rider.
  // We therefore key the map off `order.rider?.id` rather than the
  // status enum alone: any row with a rider assigned renders the
  // live Leaflet map; rows without a rider (PENDING, or PREPARING
  // waiting on dispatch) render the static placeholder.
  const riderOnTheWay =
    order.status === "offered_to_rider" ||
    order.status === "picked_up" ||
    order.status === "on_the_way" ||
    order.status === "delivered" ||
    Boolean(order.rider?.id);

  // For terminal states we still want a final render — we just stop
  // hammering the API. The loop checks the latest status before each
  // fetch via `statusIsTerminal` on the closure-bound `order`.
  const timelineStep = apiStatusToTimelineStep(order.status);
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  const placed = new Date(order.placedAt);
  const placedLabel = placed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const PAYMENT_LABEL: Record<OrderApi["paymentMethod"], string> = {
    CASH: "Cash on delivery",
    BKASH: "bKash",
    NAGAD: "Nagad",
    CARD: "Card",
  };

  return (
    <RequireAuth role="CUSTOMER">
      <main className="min-h-screen bg-surface-page">
        <TopNav />

        <section className="mx-auto w-full max-w-page px-6 pt-10 md:px-[64px]">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-muted transition-colors hover:text-brand"
          >
            ← Back to home
          </Link>

          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-brand">
                Order Tracking
              </p>
              <h1 className="mt-1 font-display text-[32px] font-extrabold leading-tight text-ink md:text-[40px]">
                {STATUS_HEADLINE[order.status]}
              </h1>
              <p className="mt-1 text-[14px] text-ink-muted">
                Order #{order.id.slice(-6).toUpperCase()} · {itemCount} item
                {itemCount === 1 ? "" : "s"} · Placed {placedLabel}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-3 self-start md:items-end md:self-end">
              <div className="inline-flex items-center gap-3 rounded-pill bg-white px-5 py-3 shadow-sm ring-1 ring-line">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand">
                  <TruckIcon size={16} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {statusIsTerminal(order.status)
                      ? order.statusLabel
                      : "Live"}
                  </span>
                  <span className="font-display text-[15px] font-bold text-ink">
                    {order.statusLabel}
                  </span>
                </div>
              </div>
              {isDelivered ? (
                <button
                  type="button"
                  onClick={() => setRateOpen(true)}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                >
                  {myReviews.length > 0
                    ? "Edit your review"
                    : "Rate this order"}
                </button>
              ) : null}
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => {
                    setCancelError(null);
                    setCancelOpen(true);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-300 bg-white px-4 text-[13px] font-bold text-rose-600 transition-colors hover:bg-rose-50"
                >
                  Cancel Order
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-page grid-cols-1 gap-6 px-6 py-10 md:grid-cols-3 md:gap-8 md:px-[64px] md:py-12">
          <div className="flex flex-col gap-6 md:col-span-2">
            {/* Pre-pickup / static illustration until a rider is
                actually moving. After the rider has been assigned +
                picked up, the live Leaflet map takes over with the
                rider's GPS pin + an OSRM road polyline. */}
            {riderOnTheWay ? (
              <TrackingMap orderId={order.id} />
            ) : (
              <MapPlaceholder
                restaurantName={order.restaurant.name}
                destinationLabel={order.deliveryAddress}
                riderOnTheWay={riderOnTheWay}
              />
            )}

            {isCancelled ? (
              <div
                role="alert"
                className="rounded-card border border-rose-200 bg-rose-50 p-6"
              >
                <h2 className="font-display text-[18px] font-extrabold text-rose-700">
                  Order cancelled
                </h2>
                {/* Bug — Feat 3 fix: the previous copy said "the
                    refund is processed automatically" for every
                    cancellation, regardless of whether the order
                    had actually been paid. For a Cash on Delivery
                    order that's misleading (we never took any
                    money). For an online-paid order, the wording
                    hid the fact that the refund lands in the
                    KhaiDai Wallet (not back on the card). Now we
                    branch on `paymentMethod` + `paymentGatewayStatus`
                    and tell the customer exactly where the money
                    went. */}
                <p className="mt-1 text-[13px] text-rose-600">
                  The restaurant couldn&apos;t accept this order.
                  {order.paymentMethod === "CASH" ||
                  order.paymentGatewayStatus !== "PAID" ? (
                    <>
                      {" "}
                      You paid by{" "}
                      {order.paymentMethod === "CASH"
                        ? "Cash on Delivery"
                        : order.paymentMethod}, so no refund is
                      required.
                    </>
                  ) : (
                    <>
                      {" "}
                      ৳{order.total.toLocaleString()} has been
                      refunded to your KhaiDai Wallet.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="rounded-card border border-line bg-white p-6">
                <h2 className="font-display text-[18px] font-extrabold text-ink">
                  Order progress
                </h2>
                <p className="mt-1 text-[13px] text-ink-muted">
                  We&apos;ll update this in real-time as your food moves
                  along.
                </p>
                <div className="mt-6">
                  <StatusTimeline currentStatus={timelineStep} />
                </div>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            {order.rider ? (
              <RiderCard rider={order.rider} />
            ) : (
              <div
                aria-label="Waiting for a rider"
                className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-6 text-center"
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff5f3] text-brand"
                >
                  <TruckIcon size={22} />
                </span>
                <h2 className="font-display text-[16px] font-extrabold text-ink">
                  Waiting for a rider
                </h2>
                <p className="text-[13px] text-ink-muted">
                  As soon as a rider accepts your order, you&apos;ll see
                  their name and phone here.
                </p>
              </div>
            )}

            {/* Feat 2 — chat with the assigned rider. Only render
                once a rider is on the order so the customer
                doesn't see a stale "Chat with …" button pointing
                at a null rider. */}
            {order.rider && user ? (
              <OrderChatPanel
                orderId={order.id}
                currentUserId={user.id}
                currentRole="CUSTOMER"
                otherPartyName={order.rider.name}
              />
            ) : null}

            <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand">
                  <MapPinAddressIcon size={18} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Delivering to
                  </span>
                  <span className="font-display text-[14px] font-bold text-ink">
                    {order.customer.name}
                  </span>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                {order.deliveryAddress}
              </p>
              <div className="h-px w-full bg-line" />
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-ink">
                  <MapPinAddressIcon size={18} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    From
                  </span>
                  <span className="font-display text-[14px] font-bold text-ink">
                    {order.restaurant.name}
                  </span>
                  <span className="mt-0.5 text-[12px] text-ink-muted">
                    {order.restaurant.address}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
              <div className="flex items-center justify-between text-[13px] text-ink-muted">
                <span>Items ({itemCount})</span>
                <span className="font-bold text-ink">
                  {formatTaka(order.subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px] text-ink-muted">
                <span>Delivery</span>
                <span className="font-bold text-ink">
                  {formatTaka(order.deliveryFee)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px] text-ink-muted">
                <span>Tax</span>
                <span className="font-bold text-ink">
                  {formatTaka(order.tax)}
                </span>
              </div>
              <div className="h-px w-full bg-line" />
              <div className="flex items-center justify-between">
                <span className="font-display text-[14px] font-extrabold text-ink">
                  Total
                </span>
                <span className="font-display text-[18px] font-extrabold text-brand">
                  {formatTaka(order.total)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px] text-ink-muted">
                <span>Paid via</span>
                <span className="flex items-center gap-2 font-bold text-ink">
                  {(() => {
                    // Brand mark — render the official wallet icon
                    // for BKASH / NAGAD so the customer recognises
                    // the wallet they paid with at a glance. Other
                    // methods (CASH / CARD) fall through to the
                    // text label only.
                    const brand =
                      order.paymentMethod === "BKASH"
                        ? { src: "/icons/bkash-logo.png", alt: "bKash" }
                        : order.paymentMethod === "NAGAD"
                          ? {
                              src: "/icons/nagad-logo.png",
                              alt: "Nagad",
                            }
                          : null;
                    if (!brand) return null;
                    return (
                      <span className="relative inline-block h-5 w-5 overflow-hidden rounded-full align-middle">
                        <Image
                          src={brand.src}
                          alt={brand.alt}
                          fill
                          sizes="20px"
                          className="object-cover"
                        />
                      </span>
                    );
                  })()}
                  <span>{PAYMENT_LABEL[order.paymentMethod]}</span>
                </span>
              </div>
              <Link
                href="/"
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
              >
                Browse more restaurants
              </Link>
            </div>
          </aside>
        </section>

        <Footer />
      </main>

      {/* Review modal — only mounted when the customer has tapped
          the "Rate this order" CTA on a delivered order. */}
      {rateOpen && isDelivered ? (
        <ReviewModal
          orderId={order.id}
          hasRider={Boolean(order.rider?.id && order.rider.id.length > 0)}
          existing={myReviews}
          onClose={() => setRateOpen(false)}
          onSubmitted={() => setMyReviews([]) /* force re-fetch on next mount */}
        />
      ) : null}

      {/* Cancel confirm modal — only mounted while the user has the
          prompt open AND the order is still in a cancellable state.
          Submitting POSTs /api/orders/[id]/cancel and refetches on
          success so the status pill flips to "Cancelled" without us
          having to know about the transition locally. */}
      {cancelOpen && canCancel ? (
        <CancelOrderDialog
          submitting={cancelling}
          error={cancelError}
          onClose={() => {
            if (!cancelling) setCancelOpen(false);
          }}
          onConfirm={async (reason) => {
            setCancelling(true);
            setCancelError(null);
            const res = await apiFetch<{
              ok: boolean;
              orderId: string;
              status: string;
            }>(`/api/orders/${order.id}/cancel`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(reason ? { reason } : {}),
            });
            setCancelling(false);
            if (!res.ok) {
              setCancelError(res.error.message);
              return;
            }
            setCancelOpen(false);
            // Pull the latest order row so the pill flips to
            // "Cancelled" without waiting for the next poll tick.
            await fetchOnce();
          }}
        />
      ) : null}
    </RequireAuth>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cancel dialog                                                             */
/* -------------------------------------------------------------------------- */

type CancelDialogProps = {
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

function CancelOrderDialog({
  submitting,
  error,
  onClose,
  onConfirm,
}: CancelDialogProps) {
  const [reason, setReason] = useState("");

  // Match the ReviewModal UX — Escape closes the dialog and we lock
  // body scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, submitting]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Cancel order"
      className="fixed inset-0 z-[1100] flex items-center justify-center px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55" aria-hidden />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-[440px] flex-col overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="font-display text-[18px] font-extrabold leading-tight text-ink">
              Cancel this order?
            </h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              This can&apos;t be undone once the restaurant accepts the
              cancellation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close cancel dialog"
            className="grid h-7 w-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface disabled:opacity-50"
          >
            ×
          </button>
        </header>
        <div className="flex flex-col gap-4 px-6 py-5">
          <label className="flex flex-col gap-2 text-[13px] font-medium text-ink">
            <span className="font-semibold">
              Reason <span className="font-normal text-ink-muted">(optional)</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Let the restaurant know why…"
              className="resize-none rounded-xl border border-line bg-surface-page px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
          </label>
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
            >
              {error}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-line bg-white px-4 py-2 text-[13px] font-bold text-ink transition-colors hover:bg-surface disabled:opacity-50"
            >
              Keep order
            </button>
            <button
              type="button"
              onClick={() => onConfirm(reason.trim())}
              disabled={submitting}
              className="rounded-xl bg-rose-600 px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Cancelling…" : "Cancel order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
