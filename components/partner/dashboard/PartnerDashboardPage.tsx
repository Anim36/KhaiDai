"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { PartnerDashboardHeader } from "@/components/partner/dashboard/PartnerDashboardHeader";
import { MetricCardsRow } from "@/components/partner/dashboard/MetricCardsRow";
import { OrdersPanel } from "@/components/partner/dashboard/OrdersPanel";
import { CreateRestaurantForm } from "@/components/partner/dashboard/CreateRestaurantForm";
import { PotIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import { resolveImageUrl } from "@/lib/imageUrl";
import { useOrdersFeed } from "@/lib/useOrdersFeed";
import type { Restaurant as ListingRestaurant } from "@/data/restaurants";

/**
 * Orchestrator for /partner/dashboard.
 *
 * State machine:
 *   1. `loading` — fetching `/api/restaurants/me`. Show a skeleton.
 *   2. `noRestaurant` — 204 from the API. Show the onboarding form.
 *   3. `ready` — restaurant exists. Show the populated dashboard
 *      (header + metric strip + orders panel) with real restaurant
 *      info pulled from the API.
 *
 * Layout (Figma `partner-dashboard`):
 *   • Page background `#f9fafb`.
 *   • Two-column shell: 260px sidebar (white) + flex-1 main column.
 *   • Main column = white header strip + 32px-padded body.
 *
 * RequireAuth(role="PARTNER") redirects anyone without a PARTNER
 * session to /partner/login.
 */
export function PartnerDashboardPage() {
  return (
    <RequireAuth role="PARTNER">
      <PartnerDashboardContent />
    </RequireAuth>
  );
}

/**
 * Result of the `/api/restaurants/me` probe.
 *
 * `reload` re-runs the probe — used by the create form after a
 * successful POST so the dashboard transitions from
 * `noRestaurant` → `ready` with the freshly-saved row.
 */
type DashboardState =
  | { kind: "loading" }
  | { kind: "noRestaurant" }
  | { kind: "ready"; restaurant: ListingRestaurant }
  | { kind: "error"; message: string };

interface DashboardController {
  state: DashboardState;
  reload: () => Promise<void>;
}

function PartnerDashboardContent() {
  const [state, setState] = useState<DashboardState>({ kind: "loading" });

  // `reloadKey` bumps each time we want to re-fetch. Putting it in
  // a state lets `useEffect` re-run the probe even though the
  // component itself doesn't unmount.
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(async () => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    async function load() {
      const res = await apiFetch<{
        restaurant: unknown;
        listing: ListingRestaurant;
      }>("/api/restaurants/me");
      if (cancelled) return;
      if (res.status === 204) {
        setState({ kind: "noRestaurant" });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: res.error.message });
        return;
      }
      const data = res.data;
      if (!data || !data.listing) {
        setState({ kind: "noRestaurant" });
        return;
      }
      setState({ kind: "ready", restaurant: data.listing });
    }

    load().catch((err) => {
      if (cancelled) return;
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load dashboard",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const controller: DashboardController = { state, reload };

  return (
    <PartnerShell activeKey="dashboard">
        <PartnerDashboardHeader />

        <div className="flex flex-1 flex-col gap-8 p-8">
          {state.kind === "loading" ? (
            <DashboardSkeleton />
          ) : state.kind === "error" ? (
            <div
              role="alert"
              className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
            >
              {state.message}
            </div>
          ) : state.kind === "noRestaurant" ? (
            <CreateRestaurantForm controller={controller} />
          ) : (
            <ReadyDashboard restaurant={state.restaurant} />
          )}
        </div>
      </PartnerShell>
  );
}

function ReadyDashboard({
  restaurant,
}: {
  restaurant: ListingRestaurant;
}) {
  const today = useTodayMetrics();

  return (
    <>
      {/* ধাপ ৪ — Admin verification banner. PENDING means the partner
          can still build out their menu / docs but no customer can
          see the restaurant yet; REJECTED carries an inline
          rejectionReason. APPROVED shows nothing. */}
      <VerificationStatusBanner restaurant={restaurant} />
      {/* Restaurant summary chip — surfaces the real name + cuisine
          so the partner immediately sees which kitchen this
          dashboard is for. When the partner hasn't uploaded a cover
          yet, render a neutral gray box rather than a hardcoded
          fallback image. */}
      <section
        aria-label="Your restaurant"
        className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5"
      >
        {restaurant.image ? (
          <div
            aria-hidden
            className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-cover bg-center"
            style={{ backgroundImage: `url('${resolveImageUrl(restaurant.image)}')` }}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface text-ink-muted"
          >
            <PotIcon size={22} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display text-[16px] font-extrabold text-ink truncate">
            {restaurant.name}
          </span>
          <span className="truncate text-[13px] font-medium text-ink-muted">
            {restaurant.cuisine} ·{" "}
            {/* Delivery fee is platform-controlled; the partner can't
                set their own. The dashboard's restaurant card
                should still show the active base fee as a
                reference — when it's not zero we say "from ৳X"
                since the actual fee depends on distance. */}
              from ৳{restaurant.deliveryFee}{" "}
            · {restaurant.timeMin}–{restaurant.timeMax} min
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-rating px-2 py-1">
          <span className="font-display text-[13px] font-bold text-ink">
            ★ {restaurant.rating.toFixed(1)}
          </span>
        </span>
      </section>

      <MetricCardsRow metrics={today} />
      <OrdersPanel />
    </>
  );
}

/**
 * Compute today's-order + today's-revenue numbers from
 * `/api/orders`. Polled on the same cadence as the OrdersPanel so
 * the metric strip stays in sync with the live data underneath.
 */
function useTodayMetrics(): { orders: number; revenue: number; rating: number } {
  // Reuse the shared PARTNER feed so the metric strip, the orders
  // panel and the orders page all read the same `/api/orders`
  // snapshot. Without this hook every surface would poll the
  // endpoint on its own and the dev log would light up.
  const feed = useOrdersFeed("PARTNER");
  return useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let orders = 0;
    let revenue = 0;
    for (const o of feed.orders) {
      if (o.status === "cancelled") continue;
      const ts = o.placedAt ?? "";
      if (!ts || new Date(ts).getTime() < startOfDay.getTime()) continue;
      orders += 1;
      revenue += o.total ?? 0;
    }
    return { orders, revenue, rating: 0 };
  }, [feed.orders]);
}

function DashboardSkeleton() {
  return (
    <>
      <div className="h-[88px] animate-pulse rounded-2xl border border-line bg-white" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[120px] animate-pulse rounded-2xl border border-line bg-white"
          />
        ))}
      </div>
      <div className="h-[260px] animate-pulse rounded-2xl border border-line bg-white" />
    </>
  );
}

/**
 * ধাপ ৪ — Partner-facing verification banner.
 *
 * Renders nothing for APPROVED restaurants (their customer-facing
 * state is unchanged). For PENDING we tell the partner their
 * restaurant is under review and that menu/prep work can continue
 * but no orders can come in. For REJECTED we surface the
 * rejectionReason so the partner knows what to fix; the menu
 * manager remains editable so they can re-submit after fixing
 * the issue.
 */
function VerificationStatusBanner({
  restaurant,
}: {
  restaurant: ListingRestaurant;
}) {
  const status = restaurant.verificationStatus;
  if (!status || status === "APPROVED") return null;

  if (status === "PENDING") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900"
      >
        <div className="mt-0.5 shrink-0 text-amber-600" aria-hidden>
          ⏳
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold leading-snug">
            Your restaurant is under review.
          </p>
          <p className="text-[13px] font-normal leading-snug text-amber-800">
            We&apos;ll notify you once it&apos;s approved. You can
            continue setting up your menu in the meantime — no
            customer will see the restaurant until it&apos;s
            approved.
          </p>
        </div>
      </div>
    );
  }

  // REJECTED.
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900"
    >
      <div className="mt-0.5 shrink-0 text-rose-600" aria-hidden>
        ⚠️
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-semibold leading-snug">
          Your restaurant application was rejected.
        </p>
        {restaurant.rejectionReason ? (
          <p className="text-[13px] font-normal leading-snug text-rose-800">
            <span className="font-semibold">Reason:</span>{" "}
            {restaurant.rejectionReason}
          </p>
        ) : null}
        <p className="text-[13px] font-normal leading-snug text-rose-800">
          Update your information and documents, then re-submit
          from the Documents page. We&apos;ll review it again.
        </p>
      </div>
    </div>
  );
}
