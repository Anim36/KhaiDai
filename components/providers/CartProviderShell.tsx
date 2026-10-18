"use client";

import { CartProvider } from "@/components/restaurants/cart/CartProvider";
import type { ReactNode } from "react";

/**
 * Client-side shell that hosts the single, app-wide <CartProvider>.
 *
 * `app/layout.tsx` is a Server Component, so it can't render a client
 * context provider directly. This tiny client component bridges the two
 * and guarantees one CartProvider instance survives every route change.
 */
export function CartProviderShell({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
