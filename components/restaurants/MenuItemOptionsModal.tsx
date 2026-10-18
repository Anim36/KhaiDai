"use client";

/**
 * MenuItemOptionsModal — Feat 1
 *
 * Bottom-sheet / centred modal that opens when the customer
 * hits "Add +" on a menu item that has option groups. The
 * customer picks a choice for every SINGLE_CHOICE group (radio
 * button) and zero-or-more for MULTI_CHOICE groups (checkboxes).
 * Required groups must have a selection before "Add to cart"
 * is enabled; the panel also shows a real-time price preview
 * (base price + sum of priceDelta).
 *
 * The draft `selectedOptions` array is built in the
 * customer-friendly shape (denormalised labels) so the cart
 * panel can render the line without re-fetching option
 * metadata. The actual price recompute happens server-side on
 * POST /api/orders — we send `optionId` + `choiceIds` only.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  MenuItem,
  MenuItemOptionDetail,
  MenuItemOptionChoiceDetail,
} from "@/data/restaurant-detail";
import type { CartLineSelectedOption } from "@/components/restaurants/cart/CartProvider";

type Props = {
  open: boolean;
  item: MenuItem;
  /** When non-null, modal is in edit-qty mode (re-clicked Add while
   * the line is already in cart). The prefill matches the line
   * the customer wants to bump. */
  editExisting?: CartLineSelectedOption[] | null;
  onClose: () => void;
  onConfirm: (selections: CartLineSelectedOption[]) => void;
};

function formatTaka(n: number): string {
  return `৳${n.toLocaleString("en-IN")}`;
}

export function MenuItemOptionsModal({
  open,
  item,
  editExisting,
  onClose,
  onConfirm,
}: Props) {
  // The options we'll show. We rely on `item.options[]` being
  // loaded from the menu page; if it's missing the modal isn't
  // useful and the parent shouldn't have opened it.
  const options: MenuItemOptionDetail[] = useMemo(
    () => (item.options ?? []) as MenuItemOptionDetail[],
    [item.options],
  );

  // Per-option selected choice ids. Keyed by option id so the
  // state stays stable when we reorder / add options.
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  // Re-seed the picker when the modal opens for a fresh item /
  // editExisting.
  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string[]> = {};
    for (const o of options) {
      if (editExisting) {
        const found = editExisting.find((e) => e.optionId === o.id);
        seed[o.id] = found ? found.choiceIds.slice() : [];
      } else {
        // For SINGLE_CHOICE, default to the first choice so the
        // modal opens with a valid selection (otherwise a
        // required group would block Add-to-cart even though the
        // customer never typed anything).
        if (o.type === "SINGLE_CHOICE" && o.choices.length > 0) {
          seed[o.id] = [o.choices[0].id];
        } else {
          seed[o.id] = [];
        }
      }
    }
    setPicked(seed);
  }, [open, options, editExisting]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  function pickSingle(optionId: string, choiceId: string) {
    setPicked((prev) => ({ ...prev, [optionId]: [choiceId] }));
  }

  function toggleMulti(optionId: string, choiceId: string) {
    setPicked((prev) => {
      const cur = prev[optionId] ?? [];
      const has = cur.includes(choiceId);
      return {
        ...prev,
        [optionId]: has
          ? cur.filter((c) => c !== choiceId)
          : [...cur, choiceId],
      };
    });
  }

  // Compute the price preview + a `required` validity flag.
  let delta = 0;
  let missingRequired: string | null = null;
  for (const o of options) {
    const chosen = picked[o.id] ?? [];
    if (o.required && chosen.length === 0) {
      missingRequired = o.name;
    }
    for (const cid of chosen) {
      const c = o.choices.find((x) => x.id === cid);
      if (c) delta += c.priceDelta;
    }
  }
  const unitPrice = Math.max(0, item.price + delta);
  const canAdd = missingRequired === null;

  function handleAdd() {
    if (!canAdd) return;
    const selections: CartLineSelectedOption[] = options.map((o) => {
      const chosen = picked[o.id] ?? [];
      const choices: MenuItemOptionChoiceDetail[] = chosen
        .map((cid) => o.choices.find((c) => c.id === cid))
        .filter((c): c is MenuItemOptionChoiceDetail => Boolean(c));
      return {
        optionId: o.id,
        choiceIds: chosen,
        name: o.name,
        choiceLabels: choices.map((c) => c.label),
        priceDelta: choices.reduce((s, c) => s + c.priceDelta, 0),
      };
    });
    onConfirm(selections);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-options-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <h2
              id="menu-options-modal-title"
              className="font-display text-[18px] font-extrabold text-ink"
            >
              {item.name}
            </h2>
            <p className="text-[12px] text-ink-muted">
              Choose options before adding to your cart.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          {options.map((o) => (
            <fieldset key={o.id} className="flex flex-col gap-2">
              <legend className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                {o.name}
                {o.required ? (
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                    Required
                  </span>
                ) : (
                  <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                    Optional
                  </span>
                )}
              </legend>
              <div className="flex flex-col gap-1">
                {o.choices.map((c) => {
                  const chosen = (picked[o.id] ?? []).includes(c.id);
                  const labelDelta =
                    c.priceDelta > 0
                      ? `+${formatTaka(c.priceDelta)}`
                      : c.priceDelta < 0
                        ? `−${formatTaka(-c.priceDelta)}`
                        : "—";
                  return (
                    <label
                      key={c.id}
                      className={
                        "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[13px] " +
                        (chosen
                          ? "border-brand bg-brand-50"
                          : "border-line bg-white hover:border-ink-muted")
                      }
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={
                            o.type === "SINGLE_CHOICE" ? "radio" : "checkbox"
                          }
                          name={`o-option-${o.id}`}
                          checked={chosen}
                          onChange={() =>
                            o.type === "SINGLE_CHOICE"
                              ? pickSingle(o.id, c.id)
                              : toggleMulti(o.id, c.id)
                          }
                          className="h-4 w-4 accent-brand"
                        />
                        <span className="font-semibold text-ink">
                          {c.label}
                        </span>
                      </span>
                      <span className="text-[12px] font-bold text-ink-muted">
                        {labelDelta}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {missingRequired ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700"
            >
              Please pick a {missingRequired} before adding to cart.
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">
              Item total
            </span>
            <span className="font-display text-[18px] font-extrabold text-brand">
              {formatTaka(unitPrice)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add to cart
          </button>
        </footer>
      </div>
    </div>
  );
}