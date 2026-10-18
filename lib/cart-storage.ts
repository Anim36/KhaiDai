// localStorage-backed cart persistence.
//
// Why this lives in a separate module
// -----------------------------------
// The CartProvider is a "use client" component but Next.js still
// imports it (and runs the module body) during SSR. SSR has no
// `window.localStorage`, so we must guard every access. Keeping
// the SSR/CSR branching here keeps the React component itself
// readable and lets the rest of the app treat cart as a normal
// piece of state.
//
// Storage shape (`localStorage["khaidai.cart.v1"]`):
//   {
//     version: 1,
//     restaurantId: string | null,
//     restaurantName: string,
//     lines: Array<{ item: MenuItem, quantity: number }>
//   }
//
// The `version` field is a forward-compat hedge — if we ever need
// to migrate the shape, we can detect old rows and discard them
// instead of crashing the provider on a mismatched field.

import type { CartLine } from "@/components/restaurants/cart/CartProvider";

const STORAGE_KEY = "khaidai.cart.v1";
const CURRENT_VERSION = 1;

export type PersistedCart = {
  version: number;
  restaurantId: string | null;
  restaurantName: string;
  lines: CartLine[];
};

/**
 * Read the persisted cart from localStorage. Returns `null` when:
 *
 *   • running on the server (no `window`)
 *   • the storage slot is empty
 *   • the stored JSON is malformed
 *   • the stored version doesn't match (stale shape from a prior
 *     deploy — better to start fresh than crash)
 *
 * We deliberately do NOT clear the storage slot on a malformed read
 * — a transient `localStorage` access error in private-mode browsers
 * shouldn't nuke the user's cart. We just return null so the
 * provider falls back to an empty in-memory cart.
 */
export function readPersistedCart(): PersistedCart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== CURRENT_VERSION) return null;
    if (!Array.isArray(obj.lines)) return null;
    // Defensive: every line must have an item with id + name + price.
    const safeLines: CartLine[] = [];
    for (const line of obj.lines) {
      if (
        line &&
        typeof line === "object" &&
        "item" in line &&
        "quantity" in line &&
        typeof (line as { quantity: unknown }).quantity === "number" &&
        (line as { quantity: number }).quantity > 0
      ) {
        const item = (line as { item: unknown }).item;
        if (
          item &&
          typeof item === "object" &&
          typeof (item as { id?: unknown }).id === "string"
        ) {
          safeLines.push({
            item: item as CartLine["item"],
            quantity: Math.max(
              1,
              Math.floor((line as { quantity: number }).quantity),
            ),
          });
        }
      }
    }
    return {
      version: CURRENT_VERSION,
      restaurantId:
        typeof obj.restaurantId === "string" ? obj.restaurantId : null,
      restaurantName:
        typeof obj.restaurantName === "string" ? obj.restaurantName : "",
      lines: safeLines,
    };
  } catch {
    return null;
  }
}

/**
 * Persist the cart to localStorage. Silent no-op on the server or
 * in private-mode browsers where `setItem` throws — losing the
 * backup is preferable to crashing the page.
 */
export function writePersistedCart(snapshot: PersistedCart): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

/** Drop the persisted cart. Called on logout / explicit clear. */
export function clearPersistedCart(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Convenience: build a snapshot from raw provider state. The
 * provider computes restaurantId itself (off `lines[0].item.restaurantId`)
 * but we accept the orchestrator's value here so a stale
 * `restaurantName` after the cart is cleared never lingers in
 * storage.
 */
export function snapshotFor(
  restaurantId: string | null,
  restaurantName: string,
  lines: CartLine[],
): PersistedCart {
  return {
    version: CURRENT_VERSION,
    restaurantId,
    restaurantName,
    lines,
  };
}