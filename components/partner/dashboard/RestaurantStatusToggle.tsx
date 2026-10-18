"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { formatHoursMinutes } from "@/lib/rider-hours-format";
import { useT } from "@/lib/i18n/LocaleProvider";
import { ToggleSwitch } from "./ToggleSwitch";

/**
 * কাজ ২ — partner-side "Accepting Orders" toggle + "Today's
 * Active Hours" tile.
 *
 *   • Reads its initial state from `/api/restaurants/me` which
 *     carries `{ isAcceptingOrders, onlineSecondsToday }`. We
 *     re-fetch on mount so a hard refresh shows the persisted
 *     server state — the same fix the RiderDashboard applied.
 *   • On click → optimistic flip → POST
 *     `/api/restaurants/status`. Revert on failure.
 *   • The toggle reuses the existing rounded-pill visual so the
 *     partner header keeps the same shape (green dot + label),
 *     but the label swaps between "Accepting Orders" and
 *     "Currently Closed" so the partner can tell at a glance
 *     whether their restaurant is reachable to customers.
 *
 * Stale-session handling: we deliberately do NOT heartbeat (see
 * `lib/restaurant-hours.ts`). An open session only affects the
 * partner's own hours counter — no customer-facing surface
 * touches it.
 */
type Props = {
  /** When true, render the "Today's Active Hours" tile too. */
  showHours?: boolean;
};

export function RestaurantStatusToggle({ showHours = true }: Props) {
  const t = useT();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [secondsToday, setSecondsToday] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load — same pattern as the rider dashboard so a hard
  // refresh shows the persisted online/offline state, not the
  // default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<{
        isAcceptingOrders?: boolean;
        onlineSecondsToday?: number;
      }>("/api/restaurants/me");
      if (cancelled) return;
      if (res.ok) {
        setIsOnline(res.data?.isAcceptingOrders ?? true);
        setSecondsToday(res.data?.onlineSecondsToday ?? 0);
      }
    })().catch(() => {
      // Network failure on first load → leave isOnline null so
      // the UI shows a neutral skeleton instead of misleading the
      // partner.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      if (busy || isOnline === null) return;
      const previous = isOnline;
      setBusy(true);
      setError(null);
      // Optimistic — flip the pill immediately so the partner
      // sees their click register. Roll back on failure.
      setIsOnline(next);
      const res = await apiFetch<{ isAcceptingOrders: boolean }>(
        "/api/restaurants/status",
        {
          method: "POST",
          body: JSON.stringify({ online: next }),
        },
      );
      if (!res.ok) {
        setIsOnline(previous);
        setError(res.error.message);
        setBusy(false);
        return;
      }
      // Server-confirmed state — refresh today's hours so the
      // partner sees the new session counted.
      if (next) {
        const me = await apiFetch<{ onlineSecondsToday?: number }>(
          "/api/restaurants/me",
        );
        if (me.ok && typeof me.data?.onlineSecondsToday === "number") {
          setSecondsToday(me.data.onlineSecondsToday);
        }
      }
      setBusy(false);
    },
    [busy, isOnline],
  );

  // Skeleton until we know the real state.
  if (isOnline === null) {
    return (
      <span
        aria-hidden
        className="hidden h-9 w-[140px] animate-pulse rounded-[20px] bg-line md:inline-flex"
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      {showHours && typeof secondsToday === "number" ? (
        <div
          className="flex flex-col items-end leading-none"
          data-tile="active-hours-today"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("partner.dashboard.hoursToday.title")}
          </span>
          <span
            data-hours-online="true"
            className="font-display text-[14px] font-bold text-ink"
          >
            {formatHoursMinutes(secondsToday)}
          </span>
        </div>
      ) : null}

      {/* iOS-style toggle switch + adjacent label. Replaces the
          previous pill-button so partners get an obvious
          "this is a toggle" affordance on desktop. The pill
          looked like a status badge, not a control — the
          toggle switch makes the click-to-flip interaction
          unambiguous. The state label ("Accepting Orders" /
          "Currently Closed") stays next to the switch so the
          meaning is still readable at a glance. */}
      <div className="flex items-center gap-2">
        <span
          data-restaurant-status={isOnline ? "online" : "offline"}
          className={
            "text-[12px] font-semibold " +
            (isOnline ? "text-[#16a34a]" : "text-ink-muted")
          }
        >
          {isOnline ? t("partner.dashboard.restaurantStatus.acceptingOrders") : t("partner.dashboard.restaurantStatus.currentlyClosed")}
        </span>
        <ToggleSwitch
          on={isOnline}
          onChange={toggle}
          busy={busy}
          ariaLabel={
            isOnline ? t("partner.dashboard.restaurantStatus.acceptingOrders") : t("partner.dashboard.restaurantStatus.currentlyClosed")
          }
        />
      </div>

      {error ? (
        <span
          role="alert"
          className="hidden text-[11px] font-semibold text-rose-600 md:inline"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}