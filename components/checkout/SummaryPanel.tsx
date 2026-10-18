"use client";

import { useState } from "react";
import { TicketIcon } from "@/components/icons";
import { formatTaka, useCart } from "@/components/restaurants/cart/CartProvider";
import { defaultPaymentMethod, TAX_RATE } from "@/data/checkout";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

type Props = {
  selectedPayment: string;
  paymentLabel: string;
  submitting: boolean;
  error: string | null;
  /**
   * Live delivery fee quoted by the parent checkout orchestrator
   * via `GET /api/delivery-fee/estimate`. Always a non-negative
   * integer Taka value; the orchestrator is responsible for
   * resetting it to 0 when the cart is empty or the required
   * inputs (cart restaurantId + customer lat/lng) aren't available.
   */
  deliveryFee: number;
  /**
   * `true` while the orchestrator is fetching a fresh fee from the
   * server — used to dim the row so the user sees a spinner instead
   * of a stale number while the request is in flight.
   */
  deliveryFeeLoading: boolean;
  onPlaceOrder: () => void;
  /**
   * Fired every time the applied promo state changes. The orchestrator
   * uses this to include `promoCode` and `discountAmount` in the order
   * POST body so the server can stamp them on the Order row.
   */
  onAppliedPromoChange: (next: {
    promoCode: string | null;
    discountAmount: number;
  }) => void;
  /** Feat 2 — customer's optional delivery instruction
   *  ("Ring the bell", "Leave at the door"). Forwarded into
   *  the POST /api/orders body so the partner and rider can see
   *  it on the order detail. */
  specialInstructions: string;
  onSpecialInstructionsChange: (next: string) => void;
};

/**
 * Right-pane sticky summary. Pixel-match to Figma:
 * - 420px wide, 20px radius, 28px padding, gap 24px
 * - "Order Summary" title (Outfit ExtraBold 20px)
 * - promo input: 44px row, ticket icon + text input + black Apply button
 * - separator hairline
 * - subtotal / delivery / VAT rows: muted 15px label + bold 16px value
 * - discount row in green (#10b981) when a code is applied
 * - total: 18px label + brand 24px value
 * - Place Order: full-width brand pill, label reflects selected payment
 *
 * Delivery fee (কাজ ৩ — fixed):
 *   • Cart empty → Delivery Fee, Vat/Tax and Total are all ৳0 / "—".
 *     The parent orchestrator forces `deliveryFee = 0` whenever the
 *     cart is empty so no stale value from a previous restaurant
 *     can persist.
 *   • Cart has items → the orchestrator calls
 *     `GET /api/delivery-fee/estimate?restaurantId=…&lat=…&lng=…` and
 *     passes the live `fee` here. We render it directly with a small
 *     "…" shimmer while the in-flight request is resolving.
 */
export function SummaryPanel({
  selectedPayment,
  paymentLabel,
  submitting,
  error,
  deliveryFee,
  deliveryFeeLoading,
  onPlaceOrder,
  onAppliedPromoChange,
  specialInstructions,
  onSpecialInstructionsChange,
}: Props) {
  const cart = useCart();
  const [promo, setPromo] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const t = useT();

  async function applyPromo() {
    const code = promo.trim();
    if (!code) {
      setPromoError(t("summaryPanel.promoEmpty"));
      return;
    }
    setPromoError(null);
    setValidating(true);
    const res = await apiFetch<{
      code: string;
      discountType: "PERCENTAGE" | "FIXED";
      discountValue: number;
      discountAmount: number;
      finalSubtotal: number;
    }>("/api/promo-codes/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        orderSubtotal: cart.subtotal,
      }),
    });
    setValidating(false);
    if (!res.ok) {
      setAppliedCode(null);
      setDiscount(0);
      onAppliedPromoChange({ promoCode: null, discountAmount: 0 });
      setPromoError(res.error.message);
      return;
    }
    const data = res.data!;
    setAppliedCode(data.code);
    setDiscount(data.discountAmount);
    onAppliedPromoChange({
      promoCode: data.code,
      discountAmount: data.discountAmount,
    });
    setPromoError(null);
  }

  function clearPromo() {
    setPromo("");
    setAppliedCode(null);
    setDiscount(0);
    setPromoError(null);
    onAppliedPromoChange({ promoCode: null, discountAmount: 0 });
  }

  const empty = cart.lines.length === 0;

  // কাজ ৩ — when the cart is empty we force every per-line total to
  // zero regardless of any stale `deliveryFee` value the parent might
  // still be holding. This is the "no stale leftovers" guarantee the
  // user reported missing.
  //
  // Bug 2: harden `deliveryFee` + `cart.subtotal` against NaN /
  // undefined so the "—" / "৳NaN" / "৳undefined" rendering paths can
  // never fire when there are items in the cart. `formatTaka` also
  // has a guard, but doing it here too keeps the displayed value
  // stable even if the parent passes a stale / unset fee.
  const safeFee = Number.isFinite(deliveryFee) ? deliveryFee : 0;
  const safeSubtotal = Number.isFinite(cart.subtotal) ? cart.subtotal : 0;
  const effectiveFee = empty ? 0 : Math.max(0, Math.round(safeFee));
  const effectiveSubtotal = empty ? 0 : safeSubtotal;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;
  const afterDiscount = Math.max(0, effectiveSubtotal - safeDiscount);
  const tax = Math.round(afterDiscount * TAX_RATE);
  const total = afterDiscount + effectiveFee + tax;
  const placeOrderText = t("summaryPanel.placeOrder", {
    label:
      paymentLabel
        .replace(/Mobile Wallet|Mobile Banking|Wallet|Card|Cash on Delivery/g, "")
        .trim() || t("summaryPanel.placeOrderSelected"),
  });

  const deliveryFeeDisplay = empty
    ? "—"
    : deliveryFeeLoading
      ? "…"
      : formatTaka(effectiveFee);

  return (
    <aside className="sticky top-24 flex w-full shrink-0 flex-col gap-5 self-start rounded-card border border-line bg-white p-4 sm:gap-6 sm:p-7 md:w-[420px]">
      <h2 className="font-display text-[20px] font-extrabold leading-none text-ink">
        {t("summaryPanel.title")}
      </h2>

      {/* Promo input group — stacked on mobile so the input
          doesn't have to share a tight row with the Apply
          button. ≥ sm keeps the original two-column layout. */}
      <div className="flex flex-col gap-2">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch">
          <div
            className={`flex h-11 flex-1 items-center gap-2 rounded-xl border bg-surface-page px-4 ${
              promoError ? "border-rose-400" : "border-line"
            }`}
          >
            <TicketIcon size={16} className="shrink-0 text-ink-muted" />
            <input
              type="text"
              value={appliedCode ?? promo}
              onChange={(e) => {
                if (appliedCode) {
                  setAppliedCode(null);
                  setDiscount(0);
                  onAppliedPromoChange({
                    promoCode: null,
                    discountAmount: 0,
                  });
                }
                setPromo(e.target.value);
                setPromoError(null);
              }}
              placeholder={t("summaryPanel.promoPlaceholder")}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-normal text-ink placeholder:text-ink-muted focus:outline-none"
              aria-invalid={promoError ? true : undefined}
            />
            {appliedCode ? (
              <button
                type="button"
                onClick={clearPromo}
                aria-label="Remove promo code"
                className="grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] font-bold text-ink-muted hover:text-ink"
              >
                ×
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={applyPromo}
            disabled={validating || appliedCode !== null}
            className="shrink-0 rounded-xl bg-ink px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink-muted"
          >
            {validating ? t("summaryPanel.promoChecking") : t("summaryPanel.promoApply")}
          </button>
        </div>
        {promoError ? (
          <span
            role="alert"
            className="text-[12px] font-semibold text-rose-600"
          >
            {promoError}
          </span>
        ) : appliedCode ? (
          <span className="text-[12px] font-semibold text-[#10b981]">
            {t("summaryPanel.promoApplied", { code: appliedCode, discount })}
          </span>
        ) : null}
      </div>

      <div className="h-px w-full bg-line" />

      <ul className="flex w-full flex-col gap-3">
        <li className="flex items-center justify-between text-[15px]">
          <span className="font-normal text-ink-muted">{t("summaryPanel.itemsSubtotal")}</span>
          <span
            data-row="items-subtotal"
            className="font-display text-[16px] font-bold text-ink"
          >
            {formatTaka(effectiveSubtotal)}
          </span>
        </li>
        <li className="flex items-center justify-between text-[15px]">
          <span className="font-normal text-ink-muted">{t("summaryPanel.deliveryFee")}</span>
          <span
            data-row="delivery-fee"
            className="font-display text-[16px] font-bold text-ink"
          >
            {deliveryFeeDisplay}
          </span>
        </li>
        <li className="flex items-center justify-between text-[15px]">
          <span className="font-normal text-ink-muted">{t("summaryPanel.platformVatTax")}</span>
          <span
            data-row="vat-tax"
            className="font-display text-[16px] font-bold text-ink"
          >
            {formatTaka(tax)}
          </span>
        </li>
        {discount > 0 ? (
          <li className="flex items-center justify-between text-[15px] text-[#10b981]">
            <span className="font-normal">{t("summaryPanel.promoLine", { code: appliedCode ?? "" })}</span>
            <span className="font-display text-[16px] font-bold">
              -{formatTaka(safeDiscount)}
            </span>
          </li>
        ) : null}
      </ul>

      <div className="h-px w-full bg-line" />

      <div className="flex items-center justify-between whitespace-nowrap">
        <span className="font-display text-[18px] font-extrabold text-ink">
          {t("summaryPanel.totalToPay")}
        </span>
        <span
          data-row="total"
          className="font-display text-[24px] font-extrabold text-brand"
        >
          {formatTaka(Math.max(0, Number.isFinite(total) ? total : 0))}
        </span>
      </div>

      {/* Feat 2 — customer's optional delivery instruction.
          Optional, 300-char cap, soft counter under the textarea. */}
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-ink-muted">
          {t("summaryPanel.specialInstructionsLabel")}
        </span>
        <textarea
          aria-label={t("summaryPanel.specialInstructionsAria")}
          value={specialInstructions}
          onChange={(e) =>
            onSpecialInstructionsChange(e.target.value.slice(0, 300))
          }
          rows={2}
          placeholder={t("summaryPanel.specialInstructionsPlaceholder")}
          className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
        />
        <span className="self-end text-[10px] text-ink-muted">
          {t("summaryPanel.charCounter", { count: specialInstructions.length })}
        </span>
      </label>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPlaceOrder}
        disabled={empty || submitting}
        className="w-full rounded-2xl bg-brand py-4 text-center font-display text-[16px] font-bold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-ink-muted"
      >
        {submitting
          ? t("summaryPanel.placingOrder")
          : empty
            ? t("summaryPanel.cartEmpty")
            : placeOrderText}
      </button>
    </aside>
  );
}

/** Helper so the orchestrator can read the default without re-importing. */
export const initialPaymentMethod = defaultPaymentMethod;