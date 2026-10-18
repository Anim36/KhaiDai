"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";

/**
 * Thin client wrapper that hosts the single, app-wide <AuthProvider>.
 *
 * `app/layout.tsx` is a Server Component so it can't render a client
 * context provider directly; this file bridges the two — same pattern
 * as CartProviderShell for the existing CartProvider.
 */
export function AuthProviderShell({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}