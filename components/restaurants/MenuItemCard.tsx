"use client";

import { useState } from "react";
import { FlameIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { MenuItemOptionsModal } from "@/components/restaurants/MenuItemOptionsModal";
import {
  formatTaka,
  useCart,
  type CartLineSelectedOption,
} from "./cart/CartProvider";
import { resolveImageUrl } from "@/lib/imageUrl";
import type { MenuItem } from "@/data/restaurant-detail";

type Props = {
  item: MenuItem;
  /** Restaurant name to attach to the cart line for the conflict modal. */
  restaurantName: string;
  /**
   * কাজ ২ — when false, the partner has flipped the "Accepting
   * Orders" toggle off. We disable Add / + / − so a customer
   * can't queue an order against an offline restaurant.
   */
  acceptingOrders?: boolean;
};

/**
 * One menu row. Pixel-perfect Figma spec:
 *   - white card, 1px line border, 16px radius, 20px padding
 *   - left: name (Outfit Bold 18px) + description (14px grey, 1.4 line)
 *   - right: price (Outfit ExtraBold 18px brand) + 120×120 image w/ rounded
 *     image and an "Add" button absolutely positioned on the bottom edge
 *   - when qty > 0 the Add button is replaced by a + / − pair inside the card.
 */
export function MenuItemCard({ item, restaurantName, acceptingOrders = true }: Props) {
  const cart = useCart();
  const offline = acceptingOrders === false;
  // Feat 1 — sum quantity across every distinct option-combination
  // for this item, so the +/- controls in the row reflect the
  // total of "Large" + "Small" + etc. The increment / decrement
  // helpers in the cart provider still operate on a single line
  // (we pass the matching selectedOptions when the user clicks
  // +/− on a specific row in the cart panel).
  const linesForItem = cart.lines.filter((l) => l.item.id === item.id);
  const totalQuantity = linesForItem.reduce((s, l) => s + l.quantity, 0);
  const hasOptions =
    Array.isArray(item.options) && item.options.length > 0;

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [editingExisting, setEditingExisting] =
    useState<CartLineSelectedOption[] | null>(null);

  function handleAddClick() {
    if (offline) return;
    if (hasOptions) {
      setEditingExisting(null);
      setOptionsOpen(true);
    } else {
      cart.tryAdd(item, restaurantName, null);
    }
  }

  function handleOptionsConfirm(sel: CartLineSelectedOption[]) {
    cart.tryAdd(item, restaurantName, sel);
    setOptionsOpen(false);
    setEditingExisting(null);
  }

  return (
    <article className="relative flex w-full items-center gap-4 rounded-2xl border border-line bg-white p-4 sm:gap-5 sm:p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 className="line-clamp-2 w-full font-display text-[16px] font-bold leading-snug text-ink sm:text-[18px]">
          {item.name}
        </h4>
        <p className="line-clamp-2 w-full text-[13px] font-normal leading-snug text-ink-muted sm:text-[14px]">
          {item.description}
        </p>
        <p className="font-display text-[16px] font-extrabold leading-none text-brand sm:text-[18px]">
          {formatTaka(item.price)}
        </p>
        {/* Feat 1 — flag a customisable item with a small badge
            so the customer knows Add+ will ask them to pick. */}
        {hasOptions ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-md bg-surface px-2 py-0.5 text-[11px] font-bold text-ink-muted">
            Customisable
          </span>
        ) : null}
      </div>

      {/* Right-side image card with the Add/+− button overlay */}
      <div className="relative h-[110px] w-[110px] shrink-0 overflow-hidden rounded-xl sm:h-[120px] sm:w-[120px]">
        <div
          aria-hidden
          className={
            "absolute inset-0 bg-cover bg-center transition " +
            (offline ? "opacity-50 grayscale" : "")
          }
          style={{ backgroundImage: `url('${resolveImageUrl(item.image)}')` }}
        />
        {offline ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-action="add-disabled-closed"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 cursor-not-allowed rounded-lg border border-line bg-surface-page px-4 py-1.5 text-[12px] font-bold text-ink-muted"
          >
            Closed
          </button>
        ) : totalQuantity === 0 ? (
          <button
            type="button"
            onClick={handleAddClick}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg border border-brand bg-white px-4 py-1.5 text-[12px] font-bold text-brand hover:bg-brand hover:text-white"
          >
            {item.popular ? (
              <span className="inline-flex items-center gap-1">
                <FlameIcon size={14} />
                Add
              </span>
            ) : (
              "Add"
            )}
          </button>
        ) : (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-brand bg-white px-3 py-1.5">
            <button
              type="button"
              aria-label={`Remove one ${item.name}`}
              // Decrement the most recently added line for this
              // item — the cart provider only removes the line
              // when qty bottoms, otherwise it decrements.
              onClick={() => {
                const last = linesForItem[linesForItem.length - 1];
                cart.decrement(item.id, last?.selectedOptions ?? null);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-page text-ink hover:bg-brand-50"
            >
              <MinusIcon size={14} />
            </button>
            <span className="min-w-[20px] text-center text-[13px] font-bold text-ink">
              {totalQuantity}
            </span>
            <button
              type="button"
              aria-label={`Add another ${item.name}`}
              // Increment re-opens the modal if the item has
              // options (the partner could be adding a second
              // distinct combination). For option-free items the
              // modal is bypassed and we bump the existing line.
              onClick={() => {
                if (hasOptions) {
                  setEditingExisting(null);
                  setOptionsOpen(true);
                } else {
                  cart.increment(item.id, null);
                }
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white hover:bg-brand/90"
            >
              <PlusIcon size={14} />
            </button>
          </div>
        )}
      </div>

      <MenuItemOptionsModal
        open={optionsOpen}
        item={item}
        editExisting={editingExisting}
        onClose={() => {
          setOptionsOpen(false);
          setEditingExisting(null);
        }}
        onConfirm={handleOptionsConfirm}
      />
    </article>
  );
}
