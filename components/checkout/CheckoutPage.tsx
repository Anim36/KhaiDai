"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { useCart } from "@/components/restaurants/cart/CartProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import {
  AddressSection,
  type ResolvedAddress,
} from "./AddressSection";
import { CartReviewSection } from "./CartReviewSection";
import { PaymentSection } from "./PaymentSection";
import { SummaryPanel } from "./SummaryPanel";
import {
  type PaymentMethodId,
  defaultPaymentMethod,
  paymentMethods,
} from "@/data/checkout";
import { apiFetch } from "@/lib/apiClient";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Map the customer-side payment id (used by the radio chips) to the
 * server-side enum the orders API accepts.
 *
 * Job 1 (কাজ ১) — only two customer choices now ("online" + "cod").
 * We still forward a non-CASH enum so the orders schema stays
 * forward-compatible (legacy data, admin analytics).
 *
 *   online → CARD   (most generic, matches today's Nagad / Rocket
 *                    fall-through). The actual wallet is decided
 *                    on SSLCommerz's gateway page; the enum value
 *                    here is only the customer's *intent*.
 *   cod    → CASH
 */
function mapPaymentForApi(
  id: PaymentMethodId,
): "CARD" | "CASH" {
  switch (id) {
    case "online":
      return "CARD";
    case "cod":
      return "CASH";
  }
}

/**
 * Does this payment method go through SSLCommerz, or is it plain
 * Cash on Delivery?
 *
 * SSLCommerz covers bKash / Nagad / Rocket / Card behind one
 * integration — the customer picks the wallet on the gateway's own
 * page, so we don't need per-provider code. COD never touches the
 * gateway: the order goes straight into the kitchen queue.
 */
function isGatewayPayment(id: PaymentMethodId): boolean {
  return id === "online";
}

/**
 * Client orchestrator for the checkout page.
 *
 *   • Reads from the app-wide CartProvider hoisted in `app/layout.tsx`
 *     so the cart the user filled on `/restaurants/[id]` is the same
 *     cart we render here.
 *   • Owns the radio selection state for payment methods.
 *   • Owns the live delivery-fee quote. We call
 *     `GET /api/delivery-fee/estimate?restaurantId=…&lat=…&lng=…` whenever
 *     the cart's restaurant or the customer's resolved address changes
 *     (কাজ ৩). When the cart is empty, or any required input is missing,
 *     we force `deliveryFee = 0` so the summary panel never persists a
 *     stale number from a previous restaurant.
 *   • "Place Order" calls `POST /api/orders`, clears the cart on
 *     success, and pushes the customer onto
 *     `/orders/[real-id]/track` so they can follow the status
 *     lifecycle in real time.
 *   • If the POST fails (validation error / server down), the cart is
 *     left intact so the user can retry.
 *
 * Auth: RequireAuth(CUSTOMER) guards the route. A guest landing on
 * `/checkout` is redirected to /login first.
 */
function CheckoutInner() {
  const t = useT();
  const router = useRouter();
  const cart = useCart();
  const heroAddress = useDeliveryAddress();
  const [payment, setPayment] = useState<PaymentMethodId>(defaultPaymentMethod);
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  // Resolved pin coords of the currently selected saved address.
  // `null` when the user hasn't chosen a pinned address yet — we use
  // this to gate the delivery-fee call.
  const [addressCoords, setAddressCoords] = useState<{
    latitude: number | null;
    longitude: number | null;
  }>({ latitude: null, longitude: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ধাপ ২/৩ — the SSLCommerz fail_url and cancel_url routes redirect
  // the customer back here with `?error=<human message>&orderId=<id>`.
  // Read it once on mount and fold it into `error` so the existing
  // error banner in <SummaryPanel> shows it with no UI change. The
  // cart was never cleared on the gateway path, so the customer can
  // simply press "Place Order" again.
  const searchParams = useSearchParams();
  const [gatewayFeedbackRead, setGatewayFeedbackRead] = useState(false);
  useEffect(() => {
    if (gatewayFeedbackRead) return;
    const msg = searchParams.get("error");
    if (msg) {
      setError(msg);
      // Clear the param so a refresh doesn't re-show a stale error,
      // without forcing a router.replace (which would remount).
      setGatewayFeedbackRead(true);
    }
  }, [searchParams, gatewayFeedbackRead]);
  // Promo code state mirrored from <SummaryPanel>. SummaryPanel owns
  // the input + validation flow; we just need to forward the applied
  // code/discount in the eventual POST /api/orders body so the server
  // stamps them onto the new Order row.
  const [appliedPromo, setAppliedPromo] = useState<{
    promoCode: string | null;
    discountAmount: number;
  }>({ promoCode: null, discountAmount: 0 });

  // Feat 2 — customer's optional delivery instruction. The
  // SummaryPanel owns a textarea that writes here; we forward
  // it inside the POST /api/orders body so the server stores
  // it on the Order row (and the partner / rider / tracking
  // pages surface it).
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Live delivery-fee quote from /api/delivery-fee/estimate.
  // কাজ ৩ — always reset to 0 the moment the cart is empty so we
  // can't leak a stale number from the previous restaurant.
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  // Tracks the most recent in-flight estimate so a slow response can't
  // overwrite a newer one if the user switched restaurants quickly.
  const fetchSeq = useRef(0);

  // If the customer picked a pin on the homepage hero before login, the
  // saved-address list will be empty on first load. In that case we
  // pre-fill the delivery street + coordinates from the hero pick so
  // the delivery-fee estimate can quote a real distance from the
  // moment the cart is populated.
  const [heroSeeded, setHeroSeeded] = useState(false);
  useEffect(() => {
    if (heroSeeded) return;
    if (!heroAddress.address) return;
    if (deliveryAddress.trim()) return;
    setDeliveryAddress(heroAddress.address.fullAddress);
    setAddressCoords({
      latitude: heroAddress.address.latitude,
      longitude: heroAddress.address.longitude,
    });
    setHeroSeeded(true);
  }, [
    heroAddress.address,
    heroSeeded,
    deliveryAddress,
  ]);

  // যখনই cart-এর restaurant পরিবর্তন হয় অথবা address-এর coords আসে,
  // নতুন করে delivery-fee estimate fetch করি। Cart খালি থাকলে বা
  // required input না থাকলে সবসময় 0 (কোনো stale value না)।
  useEffect(() => {
    const restaurantId = cart.restaurantId;
    const lat = addressCoords.latitude;
    const lng = addressCoords.longitude;
    if (!restaurantId || lat === null || lng === null) {
      setDeliveryFee(0);
      setDeliveryFeeLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;
    setDeliveryFeeLoading(true);
    void (async () => {
      try {
        const qs = new URLSearchParams({
          restaurantId,
          lat: String(lat),
          lng: String(lng),
        });
        const res = await apiFetch<{ fee?: number }>(
          `/api/delivery-fee/estimate?${qs.toString()}`,
        );
        if (seq !== fetchSeq.current) return; // stale response
        if (res.ok && typeof res.data?.fee === "number") {
          setDeliveryFee(Math.max(0, Math.round(res.data.fee)));
        } else {
          // Fall back to 0 — summary panel will show "—" for empty
          // cart and a real number once the next attempt succeeds.
          setDeliveryFee(0);
        }
      } catch {
        if (seq !== fetchSeq.current) return;
        setDeliveryFee(0);
      } finally {
        if (seq === fetchSeq.current) setDeliveryFeeLoading(false);
      }
    })();
  }, [cart.restaurantId, addressCoords.latitude, addressCoords.longitude]);

  // Belt-and-braces: when the cart is cleared (lines go to 0) we
  // synchronously zero the fee so the UI never has a frame where a
  // previous restaurant's fee is still on screen. This runs before
  // the effect above fires its reset branch.
  useEffect(() => {
    if (cart.lines.length === 0) {
      setDeliveryFee(0);
      setDeliveryFeeLoading(false);
    }
  }, [cart.lines.length]);

  const handleResolvedAddress = useCallback((resolved: ResolvedAddress) => {
    setDeliveryAddress(resolved.fullAddress);
    setAddressCoords({
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    });
  }, []);

  const handlePlaceOrder = useCallback(async () => {
    if (cart.lines.length === 0) return;
    if (!cart.restaurantId) {
      setError(
        t("checkout.errors.noRestaurant"),
      );
      return;
    }
    if (!deliveryAddress.trim()) {
      setError(
        t("checkout.errors.noAddress"),
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ order: { id: string } }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          restaurantId: cart.restaurantId,
          items: cart.lines.map((l) => ({
            menuItemId: l.item.id,
            quantity: l.quantity,
            // Feat 1 — forward the customer's choice ids per option
            // group. Server validates every id against the menu
            // item's option tree and recomputes the unit price from
            // `priceDelta`. Client `price` is never trusted.
            selectedOptions: (l.selectedOptions ?? []).map((o) => ({
              optionId: o.optionId,
              choiceIds: o.choiceIds,
            })),
          })),
          deliveryAddress: deliveryAddress.trim(),
          paymentMethod: mapPaymentForApi(payment),
          // Forward the live delivery fee the user saw at checkout.
          // Server re-validates; client value is informational and
          // covers the case where the server hasn't been seeded with
          // a DeliveryFeeConfig yet.
          deliveryFee,
          // Forward the applied promo (if any). Server re-validates;
          // client value is informational.
          ...(appliedPromo.promoCode
            ? { promoCode: appliedPromo.promoCode }
            : {}),
          // Feat 2 — customer's optional delivery instruction.
          // Trimmed + length-capped server-side.
          ...(specialInstructions.trim().length > 0
            ? { specialInstructions: specialInstructions.trim() }
            : {}),
        }),
      });
      if (!res.ok) {
        setError(res.error.message);
        setSubmitting(false);
        return;
      }
      const orderId = res.data?.order.id;
      if (!orderId) {
        setError(t("checkout.errors.orderCreatedNoId"));
        setSubmitting(false);
        return;
      }

      /* ---------------------------------------------------------------
       * ধাপ ৩ — gateway branch (bKash / Nagad / Rocket / Card).
       *
       * The Order row now exists with paymentGatewayStatus
       * NOT_INITIATED. Open an SSLCommerz session against it and
       * hand the customer off to the gateway page via a full
       * document navigation (window.location, NOT router.push —
       * a client-side route would keep this app's JS alive and
       * the gateway tab would render inside our router history).
       *
       * Deliberate: the cart is NOT cleared yet. If the customer
       * fails / cancels, /checkout comes back with the cart intact
       * so they can retry the same order. The success callback
       * route is what finally confirms the order.
       * ------------------------------------------------------------- */
      if (isGatewayPayment(payment)) {
        const init = await apiFetch<{
          gatewayPageURL: string;
        }>("/api/payments/sslcommerz/init", {
          method: "POST",
          body: JSON.stringify({ orderId }),
        });

        if (!init.ok || !init.data?.gatewayPageURL) {
          setError(
            init.ok
              ? t("checkout.errors.gatewayFailed")
              : init.error.message,
          );
          setSubmitting(false);
          return;
        }
        // setSubmitting stays true — we're navigating away and the
        // button should keep its spinner until the page unloads.
        window.location.href = init.data.gatewayPageURL;
        return;
      }

      // Cash on Delivery — exactly the old behaviour: cart cleared,
      // straight to the tracking page. No gateway involved.
      cart.clear();
      router.push(`/orders/${orderId}/track`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("checkout.errors.placeOrderFailed"));
      setSubmitting(false);
    }
  }, [
    cart,
    payment,
    router,
    deliveryAddress,
    appliedPromo.promoCode,
    deliveryFee,
  ]);

  return (
    <main className="min-h-screen bg-surface-page">
      <TopNav />

      <section className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:gap-8 md:px-[64px] md:py-16">
        {/* Left pane: cart review, address, payment */}
        <div className="flex flex-1 flex-col gap-8 min-w-px">
          <CartReviewSection />
          <AddressSection onAddressChange={handleResolvedAddress} />
          <PaymentSection selected={payment} onSelect={setPayment} />
        </div>

        {/* Right pane: sticky summary */}
        <SummaryPanel
          selectedPayment={payment}
          paymentLabel={
            paymentMethods.find((m) => m.id === payment)?.label ?? ""
          }
          submitting={submitting}
          error={error}
          deliveryFee={deliveryFee}
          deliveryFeeLoading={deliveryFeeLoading}
          onPlaceOrder={handlePlaceOrder}
          onAppliedPromoChange={setAppliedPromo}
          specialInstructions={specialInstructions}
          onSpecialInstructionsChange={setSpecialInstructions}
        />
      </section>

      <Footer />
    </main>
  );
}

/**
 * `useRouter` doesn't actually require Suspense, but we keep the
 * boundary anyway so future additions (e.g. reading search params for
 * address-from-URL) won't force a refactor of the route entry.
 */
export function CheckoutPage() {
  return (
    <RequireAuth role="CUSTOMER">
      <Suspense fallback={null}>
        <CheckoutInner />
      </Suspense>
    </RequireAuth>
  );
}