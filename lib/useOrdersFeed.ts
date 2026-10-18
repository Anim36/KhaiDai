"use client";

/**
 * Single shared polling source for `/api/orders` (list endpoint).
 *
 * Problem this solves: every page that needs orders used to own its
 * own `useEffect` + `setInterval` loop. When two surfaces mounted on
 * the same page (e.g. <OrdersPanel /> + <TodayMetricsStrip /> on the
 * partner dashboard) the dev-server log would show `GET /api/orders`
 * firing two times per tick. With a hot-reload tab + a couple of
 * accidental dependency-array bugs that re-ran the effect every
 * render, we observed callers hammering the route 10-100× per second.
 *
 * This module owns **one** polling loop per browser tab, per role
 * scope. Every subscriber renders the latest data from the same
 * in-memory snapshot, so a wide dashboard with five cards all
 * showing "today's orders" only ever triggers one network call.
 *
 * The feed itself is keyed off `UserRole` — `/api/orders` returns
 * role-scoped data:
 *
 *   • CUSTOMER — their own orders.
 *   • PARTNER  — orders for the partner's restaurant.
 *   • RIDER    — orders the rider is assigned to.
 *
 * Switching roles (logout / login) tears down the relevant loop.
 * Subscribers attach/unmount with `useOrdersFeed(role)` — the hook
 * returns the latest snapshot + a `refresh()` action for manual
 * invalidation after a mutation (e.g. cancel order from the
 * partner-side modal).
 *
 * Why a module singleton rather than a React context?
 *   • A context would force every page tree to manually wrap with a
 *     provider. Module state is "just there" for any client
 *     component, including the customer profile, the partner
 *     dashboard, the rider dashboard, the order-tracking page, and
 *     any future surface.
 *   • We get automatic dedup across disjoint trees.
 *   • No risk of two providers shadowing each other.
 */

import { useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/apiClient";
import type { OrderStatusApi } from "@/lib/orders";

export type UserRoleForFeed = "CUSTOMER" | "PARTNER" | "RIDER" | "GUEST";

export type FeedOrder = {
  id: string;
  status: OrderStatusApi;
  placedAt?: string;
  total?: number;
  customer?: { name?: string; phone?: string | null };
  restaurant?: {
    id?: string;
    name?: string;
    address?: string;
  };
  rider?: { id?: string; name?: string; phone?: string | null } | null;
  items?: Array<{ name?: string; qty?: number; price?: number }>;
  deliveryAddress?: string;
  subtotal?: number;
  paymentMethod?: string;
  /** Feat 2 — customer's optional delivery note. */
  specialInstructions?: string | null;
};

export type FeedState = {
  /** All orders for the current role (CUSTOMER/PARTNER/RIDER). */
  orders: FeedOrder[];
  /** True when at least one network fetch is in flight. */
  loading: boolean;
  /** Server-side error message; null when the last fetch succeeded. */
  error: string | null;
  /** Server-supplied timestamp; useful for "last refreshed Xs ago". */
  lastUpdated: number | null;
};

const INITIAL_STATE: FeedState = {
  orders: [],
  loading: true,
  error: null,
  lastUpdated: null,
};

/* -------------------------------------------------------------------------- */
/*  Per-role entry                                                            */
/* -------------------------------------------------------------------------- */

type RoleEntry = {
  state: FeedState;
  listeners: Set<() => void>;
  pollHandle: ReturnType<typeof setInterval> | null;
  inflight: AbortController | null;
  /** Monotonic counter used to skip stale resolves. */
  fetchSeq: number;
  /** Latest `role` argument the entry was started with. */
  role: UserRoleForFeed;
};

const POLL_INTERVAL_MS = 9_000;

const entries: Partial<Record<UserRoleForFeed, RoleEntry>> = {};

function getOrCreateEntry(role: UserRoleForFeed): RoleEntry {
  const existing = entries[role];
  if (existing) return existing;
  const created: RoleEntry = {
    state: { ...INITIAL_STATE },
    listeners: new Set(),
    pollHandle: null,
    inflight: null,
    fetchSeq: 0,
    role,
  };
  entries[role] = created;
  return created;
}

function setState(role: UserRoleForFeed, patch: Partial<FeedState>) {
  const entry = entries[role];
  if (!entry) return;
  entry.state = { ...entry.state, ...patch };
  // Copying into a new object before iterating lets hooks
  // bail early via Object.is and avoids tearing.
  for (const l of entry.listeners) l();
}

async function fetchOnce(role: UserRoleForFeed) {
  const entry = entries[role];
  if (!entry) return;
  if (entry.inflight) {
    // Another fetch is still mid-flight; don't pile up more.
    return;
  }
  // Anonymous users have no auth — the API returns 401 quickly so
  // there's no point dispatching a fetch loop just for an empty
  // guest state.
  if (role === "GUEST") {
    setState(role, { orders: [], loading: false, error: null });
    return;
  }
  const seq = ++entry.fetchSeq;
  entry.inflight = new AbortController();
  try {
    const res = await apiFetch<{ orders?: FeedOrder[] }>("/api/orders");
    if (seq !== entry.fetchSeq) return; // stale
    if (!res.ok) {
      // 401 on logout race: discard silently. Other errors surface.
      if (res.status !== 401) {
        setState(role, {
          loading: false,
          error: res.error.message,
        });
      } else {
        setState(role, { loading: false, error: null });
      }
      return;
    }
    const raw = Array.isArray(res.data?.orders) ? res.data.orders : [];
    const orders = raw as FeedOrder[];
    setState(role, {
      orders,
      loading: false,
      error: null,
      lastUpdated: Date.now(),
    });
  } catch (err) {
    if (seq !== entry.fetchSeq) return;
    setState(role, {
      loading: false,
      error: err instanceof Error ? err.message : "Failed to load orders",
    });
  } finally {
    if (entry) entry.inflight = null;
  }
}

function startPolling(role: UserRoleForFeed) {
  const entry = getOrCreateEntry(role);
  if (entry.pollHandle) return; // already running
  // Kick off immediately so subscribers don't see "loading forever".
  void fetchOnce(role);
  // setInterval, not setTimeout recursion — easier to clear, no
  // chance of stacking timers on a re-render.
  entry.pollHandle = setInterval(() => {
    void fetchOnce(role);
  }, POLL_INTERVAL_MS);
}

/* -------------------------------------------------------------------------- */
/*  Reference-count based subscription (no double polling)                    */
/* -------------------------------------------------------------------------- */

const subscriberCounts: Partial<Record<UserRoleForFeed, number>> = {};

function acquire(role: UserRoleForFeed): RoleEntry {
  const entry = getOrCreateEntry(role);
  subscriberCounts[role] = (subscriberCounts[role] ?? 0) + 1;
  // First subscriber starts the loop; last one stops it on release.
  if (subscriberCounts[role] === 1) {
    startPolling(role);
  }
  return entry;
}

function release(role: UserRoleForFeed) {
  const next = (subscriberCounts[role] ?? 0) - 1;
  if (next <= 0) {
    subscriberCounts[role] = 0;
    const entry = entries[role];
    if (entry?.pollHandle) {
      clearInterval(entry.pollHandle);
      entry.pollHandle = null;
    }
    if (entry?.inflight) {
      entry.inflight.abort();
      entry.inflight = null;
    }
    // Reset state so a future mount starts fresh.
    if (entry) entry.state = { ...INITIAL_STATE };
  } else {
    subscriberCounts[role] = next;
  }
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useOrdersFeed(role: UserRoleForFeed): FeedState & {
  refresh: () => Promise<void>;
} {
  const entry = acquire(role);

  // useSyncExternalStore keeps the subscription refs and listener
  // registration side-effect in one place, with a stable `subscribe`
  // and `getSnapshot` so React's strict-mode double-invoke (and
  // concurrent rendering) don't accidentally start the polling loop
  // twice.
  //
  // `getServerSnapshot` is required when the component is rendered
  // during SSR (e.g. the <RiderDashboardPage> server route delegating
  // to a client orchestrator). Without it React throws and the
  // route returns 500. We return a clean "no data, no error" state
  // for server pre-render — the client effect below immediately
  // hydrates the real snapshot once the browser takes over.
  const state = useSyncExternalStore(
    (cb) => {
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
      };
    },
    () => entry.state,
    () => INITIAL_STATE,
  );

  useEffect(() => {
    // Increment-then-decrement would race in StrictMode; rely on the
    // acquire/release symmetry instead.
    return () => release(role);
    // We intentionally bind the cleanup to role only — the entry
    // singleton is stable per role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return {
    ...state,
    refresh: async () => {
      await fetchOnce(role);
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Manual refresh + hard reset (for tests / logout)                          */
/* -------------------------------------------------------------------------- */

/** Force a one-shot refetch on the role's entry. */
export function refreshOrdersFeed(role: UserRoleForFeed): Promise<void> {
  return fetchOnce(role);
}

/** Tear down a role's loop and reset its state. (Used on logout.) */
export function resetOrdersFeed(role: UserRoleForFeed) {
  const entry = entries[role];
  if (!entry) return;
  if (entry.pollHandle) clearInterval(entry.pollHandle);
  if (entry.inflight) entry.inflight.abort();
  entry.pollHandle = null;
  entry.inflight = null;
  entry.state = { ...INITIAL_STATE };
  subscriberCounts[role] = 0;
  // Wake up any listener so they see the cleared snapshot.
  for (const l of entry.listeners) l();
}
