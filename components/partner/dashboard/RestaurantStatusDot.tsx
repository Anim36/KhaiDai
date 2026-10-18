"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Partner mobile-navbar variant of the restaurant accepting /
 * closed indicator. Renders a single round button — green when
 * the restaurant is accepting orders, neutral gray when paused
 * — and tappable to flip state. The full pill version
 * (Accepting Orders / Currently Closed + Hours Today tile)
 * still lives in the dashboard page header via
 * <RestaurantStatusToggle />; this dot is just the at-a-glance
 * status affordance for the topbar.
 *
 * Sized h-7 w-7 to match the other small-circle controls in
 * the partner mobile topbar (LangToggle, NotificationBell).
 */
export function RestaurantStatusDot() {
  const t = useT();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiFetch<{ isAcceptingOrders?: boolean }>(
        "/api/restaurants/me",
      );
      if (cancelled) return;
      if (res.ok) {
        setIsOnline(res.data?.isAcceptingOrders ?? true);
      }
    })().catch(() => {
      // network failure -> leave null; UI shows a neutral
      // skeleton dot
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
      }
      setBusy(false);
    },
    [busy, isOnline],
  );

  // Skeleton until we know real state.
  if (isOnline === null) {
    return (
      <span
        aria-hidden
        className="inline-flex h-7 w-7 animate-pulse rounded-full bg-line"
      />
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOnline}
      aria-label={
        isOnline
          ? t("partner.dashboard.restaurantStatus.acceptingOrders")
          : t("partner.dashboard.restaurantStatus.currentlyClosed")
      }
      title={
        isOnline
          ? t("partner.dashboard.restaurantStatus.acceptingOrders")
          : t("partner.dashboard.restaurantStatus.currentlyClosed")
      }
      data-action="toggle-accepting-orders-mobile"
      data-online={isOnline}
      disabled={busy}
      onClick={() => toggle(!isOnline)}
      className={
        "inline-flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 " +
        (isOnline
          ? "bg-[#dcfce7] focus-visible:ring-[#16a34a]/40"
          : "bg-surface-soft focus-visible:ring-ink-muted/40")
      }
    >
      <span
        aria-hidden
        className={
          "h-2.5 w-2.5 rounded-full " +
          (isOnline ? "bg-[#16a34a]" : "bg-ink-muted")
        }
      />
    </button>
  );
}
