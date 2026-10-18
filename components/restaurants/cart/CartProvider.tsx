"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MenuItem } from "@/data/restaurant-detail";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  clearPersistedCart,
  readPersistedCart,
  snapshotFor,
  writePersistedCart,
} from "@/lib/cart-storage";

/**
 * A single line on the cart panel.
 *
 * The `restaurantId` lives on the underlying `MenuItem` already
 * (every dish belongs to one restaurant) so we don't duplicate it
 * here — the active cart's restaurant id is `lines[0].item.restaurantId`.
 *
 * Feat 1 — `selectedOptions` carries the option/choice snapshot
 * the customer picked at Add-time. Two lines with the same item
 * but different option combinations stay as two distinct cart
 * lines (so "Pizza · Large" and "Pizza · Small" can coexist).
 * Lines with the same item AND identical option signature
 * merge their quantities (so re-adding the same combination
 * still increments the line).
 */
export type CartLineSelectedOption = {
  optionId: string;
  choiceIds: string[];
  // Denormalised for display in the cart panel.
  name: string;
  choiceLabels: string[];
  priceDelta: number;
};
export type CartLine = {
  item: MenuItem;
  quantity: number;
  selectedOptions?: CartLineSelectedOption[] | null;
};

/**
 * Result of trying to add an item to the cart.
 *
 *   added        — first item, or item from the same restaurant as the
 *                  active cart. No UI action needed.
 *   conflict     — cart already has items from another restaurant. The
 *                  CartProvider shows a confirmation modal; the page
 *                  shouldn't do anything else. The new item is held in
 *                  `pending` until the user confirms.
 */
export type CartAddResult =
  | { kind: "added"; pending: null }
  | {
      kind: "conflict";
      pending: PendingItem;
      existingRestaurantId: string;
      existingRestaurantName: string;
    };

/** Snapshot of the item the user just tried to add. */
export type PendingItem = {
  item: MenuItem;
  /** Display name of the restaurant this item came from. */
  restaurantName: string;
  /**
   * Feat 1 — option snapshot the customer picked before the
   * conflict modal fired. Confirmed by `confirmReplace` so the
   * replacement cart line carries the same customisation.
   */
  selectedOptions?: CartLineSelectedOption[] | null;
};

type CartContextValue = {
  lines: CartLine[];
  /** Sum of every line's subtotal (item.price × qty). */
  subtotal: number;
  /** Number of distinct items currently in cart. */
  count: number;
  /** Name of the restaurant whose menu is being viewed. */
  restaurantName: string;
  /**
   * Restaurant id of the active cart. Required by checkout so the
   * `POST /api/orders` payload knows which restaurant to attach the
   * order to. Pulled from the first cart line.
   */
  restaurantId: string | null;
  /**
   * Attempt to add an item to the cart. If the cart is empty, the
   * item is from the same restaurant as the active cart, or the
   * caller is the restaurant's own menu page, the item is added
   * immediately and `added` is returned. Otherwise we surface a
   * conflict so the CartProvider can show its confirmation modal.
   *
   * The `restaurantName` argument is only used when the cart is empty
   * (to seed the active-cart restaurant name) or when we hit a
   * conflict (to label the new restaurant in the prompt).
   */
  tryAdd: (
    item: MenuItem,
    restaurantName: string,
    selectedOptions?: CartLineSelectedOption[] | null,
  ) => CartAddResult;
  /** User confirmed the conflict; replace the cart with the pending item. */
  confirmReplace: () => void;
  /** User dismissed the conflict modal — no cart change. */
  dismissConflict: () => void;
  remove: (itemId: string) => void;
  /** Feat 1 — increment / decrement a line keyed on
   *  (itemId, selectedOptions). The signature on the
   *  selectedOptions array is what makes a "Large" pizza and a
   *  "Small" pizza two distinct cart lines. */
  increment: (
    itemId: string,
    selectedOptions?: CartLineSelectedOption[] | null,
  ) => void;
  decrement: (
    itemId: string,
    selectedOptions?: CartLineSelectedOption[] | null,
  ) => void;
  /** Update the currently-active restaurant name (shown beside the cart panel). */
  setRestaurantName: (name: string) => void;
  /** Empty the cart without unmounting the provider. */
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function rupee(n: number) {
  // Defensive formatter. Bangla (bn) locale users reported seeing
  // "—" instead of a real price on the checkout summary when the
  // upstream value came back as NaN/undefined. The price-rendering
  // path used to blindly call `৳${n}`, which produced strings like
  // "৳NaN" or "৳undefined" — visually distracting and a clear UX bug.
  // We coerce to 0 first so the formatter always emits a usable
  // Latin-digit number, never an empty dash or a "NaN" string.
  if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) {
    return `৳0`;
  }
  return `৳${Math.max(0, Math.round(n))}`;
}

/**
 * Exposes a typed formatter for amounts so the cart panel and item
 * cards stay consistent.
 */
export function formatTaka(n: number) {
  return rupee(n);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  // কাজ ১ — initial state matches what the server renders (empty
  // cart). The first client effect hydrates from localStorage so a
  // hard refresh doesn't drop the cart.
  const [lines, setLines] = useState<CartLine[]>([]);
  const [restaurantName, setRestaurantNameState] = useState<string>("");
  const [pending, setPending] = useState<PendingItem | null>(null);

  // Mirrors the last-persisted snapshot so we can skip a write when
  // the cart hasn't actually changed (e.g. a no-op decrement that
  // bottoms-out and removes the line — we'd otherwise write twice
  // for the same visible state). Also used to dedupe the hydration
  // write — we DON'T want to overwrite a persisted snapshot on
  // mount before we've finished reading it.
  const lastSnapshotRef = useRef<string>("");

  const setRestaurantName = useCallback((name: string) => {
    setRestaurantNameState(name);
  }, []);

  /**
 * Feat 1 — compare two `selectedOptions` arrays by content. We
 * sort each by optionId, then by choiceIds[0] so the cart can
 * match "Large + Cheese" against "Cheese + Large" regardless of
 * UI ordering. The radio/checkbox in the modal always produces
 * the same set either way.
 */
function sameSelection(
  a: CartLineSelectedOption[] | null | undefined,
  b: CartLineSelectedOption[] | null | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  const norm = (xs: CartLineSelectedOption[]) =>
    xs
      .map((x) => ({
        optionId: x.optionId,
        choiceIds: [...x.choiceIds].sort().join("|"),
      }))
      .sort((x, y) => x.optionId.localeCompare(y.optionId));
  const aKey = JSON.stringify(norm(aa));
  const bKey = JSON.stringify(norm(bb));
  return aKey === bKey;
}

const tryAdd = useCallback(
  (
    item: MenuItem,
    restaurantName: string,
    selectedOptions?: CartLineSelectedOption[] | null,
  ): CartAddResult => {
    // First add — accept and seed the restaurant name.
    if (lines.length === 0) {
      setRestaurantNameState(restaurantName);
      setLines([
        { item, quantity: 1, selectedOptions: selectedOptions ?? null },
      ]);
      setPending(null);
      return { kind: "added", pending: null };
    }

    const existingRestaurantId = lines[0]?.item.restaurantId ?? null;
    // Same restaurant — merge quantity on (itemId, selectedOptions).
    if (existingRestaurantId && existingRestaurantId === item.restaurantId) {
      setLines((prev) => {
        const existing = prev.find(
          (l) =>
            l.item.id === item.id &&
            sameSelection(l.selectedOptions, selectedOptions),
        );
        if (existing) {
          return prev.map((l) =>
            l === existing ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
        return [
          ...prev,
          { item, quantity: 1, selectedOptions: selectedOptions ?? null },
        ];
      });
      setPending(null);
      return { kind: "added", pending: null };
    }

    // Conflict — different restaurant in cart. Hold the pending
    // item and surface a confirmation modal.
    const next: PendingItem = {
      item,
      restaurantName,
      selectedOptions: selectedOptions ?? null,
    };
    setPending(next);
    return {
      kind: "conflict",
      pending: next,
      existingRestaurantId: existingRestaurantId ?? "",
      existingRestaurantName: restaurantName,
    };
  },
  [lines, restaurantName],
);

  const confirmReplace = useCallback(() => {
    if (!pending) return;
    setRestaurantNameState(pending.restaurantName);
    setLines([
      {
        item: pending.item,
        quantity: 1,
        selectedOptions: pending.selectedOptions ?? null,
      },
    ]);
    setPending(null);
  }, [pending]);

  const dismissConflict = useCallback(() => {
    setPending(null);
  }, []);

  const remove = useCallback((itemId: string) => {
    setLines((prev) => prev.filter((l) => l.item.id !== itemId));
  }, []);

  const increment = useCallback(
    (
      itemId: string,
      selectedOptions?: CartLineSelectedOption[] | null,
    ) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.item.id !== itemId) return l;
          if (!sameSelection(l.selectedOptions, selectedOptions)) return l;
          return { ...l, quantity: l.quantity + 1 };
        }),
      );
    },
    [],
  );

  const decrement = useCallback(
    (
      itemId: string,
      selectedOptions?: CartLineSelectedOption[] | null,
    ) => {
      setLines((prev) =>
        prev
          .map((l) => {
            if (l.item.id !== itemId) return l;
            if (!sameSelection(l.selectedOptions, selectedOptions)) return l;
            return { ...l, quantity: l.quantity - 1 };
          })
          .filter((l) => l.quantity > 0),
      );
    },
    [],
  );

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum +
          (l.item.price +
            (l.selectedOptions ?? []).reduce(
              (s, o) => s + o.priceDelta,
              0,
            )) *
            l.quantity,
        0,
      ),
    [lines],
  );
  const count = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );

  const clear = useCallback(() => {
    setLines([]);
    setRestaurantNameState("");
    setPending(null);
    // Wipe the persisted copy so a hard refresh on /login doesn't
    // resurrect the previous session's cart.
    clearPersistedCart();
    lastSnapshotRef.current = "";
  }, []);

  // কাজ ১ — hydrate from localStorage on first mount. We read after
  // the React tree commits so we don't trigger an SSR/CSR
  // hydration mismatch warning. The first render is identical on
  // server + client (empty cart), then this effect rehydrates.
  useEffect(() => {
    const persisted = readPersistedCart();
    if (!persisted) return;
    // Seed the snapshot ref so the next persist write doesn't fire
    // a redundant overwrite.
    lastSnapshotRef.current = JSON.stringify(persisted);
    if (persisted.lines.length > 0) {
      setLines(persisted.lines);
      setRestaurantNameState(persisted.restaurantName);
    }
  }, []);

  // কাজ ১ — log out → wipe the cart. Otherwise the next person to
  // log in on this device would inherit the previous session's
  // pending order.
  const userId = auth.user?.id ?? null;
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    // First mount — just remember who we are, don't wipe.
    if (prevUserIdRef.current === null) {
      prevUserIdRef.current = userId;
      return;
    }
    // Was signed-in, now signed-out → clear.
    if (prevUserIdRef.current !== null && userId === null) {
      clear();
    }
    // Identity changed (login or switch) → clear.
    if (
      prevUserIdRef.current !== null &&
      userId !== null &&
      prevUserIdRef.current !== userId
    ) {
      clear();
    }
    prevUserIdRef.current = userId;
    // `clear` is stable (useCallback with [] deps), so we don't need
    // it in the deps array. Including it would cause an extra
    // effect run on mount that's harmless but pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // কাজ ১ — persist on every lines/restaurantName change. The
  // snapshot key includes a stringified payload so a no-op update
  // (same value in, same value out) skips the localStorage write.
  useEffect(() => {
    const restaurantId = lines[0]?.item.restaurantId ?? null;
    const snapshot = snapshotFor(restaurantId, restaurantName, lines);
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSnapshotRef.current) return;
    lastSnapshotRef.current = serialized;
    // Don't bother writing an empty cart — the next effect (cart
    // becomes empty because user navigated away or logged out)
    // already calls clearPersistedCart(). Writing empty snapshots
    // would create a "ghost" row in localStorage that the next
    // mount would have to read + discard.
    if (lines.length === 0) {
      clearPersistedCart();
      return;
    }
    writePersistedCart(snapshot);
  }, [lines, restaurantName]);

  const value: CartContextValue = {
    lines,
    subtotal,
    count,
    restaurantName,
    restaurantId: lines[0]?.item.restaurantId ?? null,
    tryAdd,
    confirmReplace,
    dismissConflict,
    remove,
    increment,
    decrement,
    setRestaurantName,
    clear,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      {/* Cart-conflict modal. Rendered at the provider level so every
          page that adds to the cart (homepage trending, restaurant
          detail) gets the same confirmation UX for free. The modal
          uses portal-style positioning (fixed inset-0 + z-50) so it
          covers whatever page is behind. */}
      <CartConflictModal
        open={pending !== null}
        pending={pending}
        onConfirm={confirmReplace}
        onCancel={dismissConflict}
      />
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  CartConflictModal                                                          */
/* -------------------------------------------------------------------------- */

function CartConflictModal({
  open,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  pending: PendingItem | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ctx = useContext(CartContext);
  const currentName = ctx?.restaurantName ?? "";

  // Close on Escape — same affordance as the partner menu modal.
  if (typeof window !== "undefined" && open) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey, { once: true });
  }
  if (!open || !pending) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-conflict-title"
      data-cart-conflict-modal="true"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-[440px] flex-col gap-5 overflow-y-auto rounded-3xl border border-line bg-white p-6 shadow-xl">
        <header className="flex flex-col gap-1">
          <h2
            id="cart-conflict-title"
            className="font-display text-[20px] font-extrabold leading-tight text-ink"
          >
            Start a new cart?
          </h2>
          <p className="text-[13px] leading-snug text-ink-muted">
            Your cart already has items from{" "}
            <span className="font-semibold text-ink">
              {currentName || "another restaurant"}
            </span>
            . Adding this item will clear those items and start a fresh
            cart for{" "}
            <span className="font-semibold text-ink">
              {pending.restaurantName}
            </span>
            .
          </p>
        </header>

        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            New item
          </span>
          <span className="text-[14px] font-semibold text-ink">
            {pending.item.name}
          </span>
          <span className="text-[12px] text-ink-muted">
            From {pending.restaurantName} · ৳{pending.item.price}
          </span>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <button
            type="button"
            onClick={onCancel}
            data-action="cart-conflict-cancel"
            className="h-12 w-full rounded-xl border border-line bg-white text-[14px] font-semibold text-ink hover:bg-surface md:w-auto md:px-6"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-action="cart-conflict-confirm"
            className="h-12 w-full rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 md:w-auto"
          >
            Replace cart
          </button>
        </div>
      </div>
    </div>
  );
}