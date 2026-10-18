"use client";

import Link from "next/link";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { formatTaka, useCart } from "./cart/CartProvider";

/**
 * Cart panel.
 *
 *   • Desktop (lg+): 380px-wide sticky right column (`sticky top-24`).
 *   • Mobile (< lg): the restaurant-detail layout stacks the menu
 *     and the cart vertically. A right-side sticky panel would be
 *     useless because the rider's thumb is at the bottom of the
 *     screen, not the side. So on mobile we collapse the cart into
 *     a slim sticky-bottom "View Cart" bar that shows the item
 *     count + the subtotal + a big "Go to Checkout" button — the
 *     same one-tap thumb experience Foodpanda / Uber Eats ship.
 *
 * When the cart is empty the bar is hidden on mobile (nothing to
 * act on). The desktop card still shows the empty-state copy.
 */
export function CartPanel() {
  const cart = useCart();
  const lines = cart.lines;
  const hasItems = lines.length > 0;

  return (
    <>
      {/* Desktop right-rail card (lg+). */}
      <aside className="sticky top-24 hidden w-full shrink-0 flex-col gap-5 self-start rounded-2xl border border-line bg-white p-6 md:w-[380px] lg:flex">
        <CartCardBody />
      </aside>

      {/* Mobile sticky-bottom "View Cart" bar (< lg). Hidden
          when the cart is empty — there's nothing to act on. */}
      {hasItems ? (
        <div
          data-cart-sticky-bar="true"
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 pb-safe shadow-[0_-2px_12px_rgba(0,0,0,0.06)] lg:hidden"
        >
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {cart.count} {cart.count === 1 ? "item" : "items"} • {cart.restaurantName}
            </span>
            <span className="font-display text-[18px] font-extrabold text-ink">
              {formatTaka(cart.subtotal)}
            </span>
          </div>
          <Link
            href="/checkout"
            data-cart-go-to-checkout="true"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            View Cart
          </Link>
        </div>
      ) : null}
    </>
  );
}

/**
 * Inner card used by the desktop right rail. Pulled out so the
 * mobile sticky bar (which doesn't need the item list) doesn't
 * re-render it.
 */
function CartCardBody() {
  const cart = useCart();
  return (
    <>
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[20px] font-extrabold leading-none text-ink">
          Your Cart
        </h2>
        <p className="text-[14px] font-normal text-ink-muted">
          {cart.count > 0
            ? `${cart.count} item${cart.count > 1 ? "s" : ""} from ${cart.restaurantName}`
            : "Your cart is empty"}
        </p>
      </header>

      {cart.lines.length > 0 ? (
        <div className="flex flex-col gap-4">
          {cart.lines.map((line) => {
            // Feat 1 — when a line carries a customisation
            // snapshot, render a small comma-joined label so the
            // customer can tell "Pizza · Large" apart from
            // "Pizza · Small" inside the cart panel.
            const opts = line.selectedOptions ?? [];
            const optsLabel =
              opts.length === 0
                ? null
                : opts
                    .flatMap((o) =>
                      o.choiceLabels.length === 0
                        ? []
                        : [o.choiceLabels.join(", ")],
                    )
                    .join(" · ");
            const lineUnit =
              line.item.price +
              opts.reduce((s, o) => s + o.priceDelta, 0);
            return (
              <div
                key={`${line.item.id}-${optsLabel ?? "_plain"}`}
                className="flex w-full items-start justify-between gap-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate font-display text-[14px] font-bold text-ink">
                    {line.item.name}
                  </p>
                  {optsLabel ? (
                    <p
                      className="truncate text-[11px] font-semibold text-ink-muted"
                      title={optsLabel}
                    >
                      {optsLabel}
                    </p>
                  ) : null}
                  <p className="text-[13px] font-normal text-ink-muted">
                    {formatTaka(lineUnit)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-xl bg-surface-page px-2 py-1.5">
                  <button
                    type="button"
                    aria-label={`Remove one ${line.item.name}`}
                    onClick={() =>
                      cart.decrement(line.item.id, line.selectedOptions)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-ink hover:bg-brand-50"
                  >
                    <MinusIcon size={14} />
                  </button>
                  <span className="min-w-[18px] text-center font-display text-[14px] font-bold text-ink">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add another ${line.item.name}`}
                    onClick={() =>
                      cart.increment(line.item.id, line.selectedOptions)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-white hover:bg-brand/90"
                  >
                    <PlusIcon size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between border-t border-line pt-4 text-[15px]">
            <span className="font-normal text-ink-muted">Subtotal</span>
            <span className="font-display text-[18px] font-extrabold text-ink">
              {formatTaka(cart.subtotal)}
            </span>
          </div>

          <Link
            href="/checkout"
            className="block w-full rounded-2xl bg-brand py-4 text-center font-display text-[16px] font-bold text-white hover:bg-brand/90"
          >
            Go to Checkout
          </Link>
        </div>
      ) : null}
    </>
  );
}