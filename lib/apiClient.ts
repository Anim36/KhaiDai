"use client";

import type { AuthUser } from "@/components/auth/AuthProvider";

/**
 * Tiny browser-side fetch helper that always attaches the
 * KhaiDai bearer token from localStorage. The Partner Dashboard
 * onboarding flow and the Menu Management page use this when they
 * hit `/api/restaurants/*` and `/api/menu-items/*`.
 *
 * We deliberately use localStorage directly (rather than reading
 * from React Context) so callers don't need to pass a `useAuth()`
 * result down. The AuthProvider is the single writer — multiple
 * readers is fine.
 */

const STORAGE_KEY = "khaidai.auth.v2";

type Stored = { token: string; user: AuthUser };

function readStored(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (
      parsed &&
      typeof parsed.token === "string" &&
      parsed.user &&
      typeof parsed.user.id === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export type ApiError = {
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

/**
 * Send an authenticated request to the API. Always reads the
 * current token from storage right before firing so we pick up
 * fresh logins / logouts without a hard reload.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const stored = readStored();
  const token = stored?.token ?? null;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: {
        status: 0,
        message: err instanceof Error ? err.message : "Network error",
      },
    };
  }

  // 204 No Content (used by /api/restaurants/me when no restaurant
  // yet) has no body — return a synthetic payload.
  if (res.status === 204) {
    return { ok: true, status: 204, data: null as T };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body — keep null */
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: json as T };
  }
  const obj = json as { error?: string } | null;
  return {
    ok: false,
    status: res.status,
    error: {
      status: res.status,
      message: obj?.error ?? `Request failed (${res.status})`,
    },
  };
}
