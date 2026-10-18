"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiClient";

/**
 * Bridges the browser geolocation API with the rider's server-side
 * "I'm online" presence.
 *
 *   • While `enabled`, we ask the browser for geolocation permissions,
 *     start watching position changes, and re-POST lat/lng every
 *     `intervalMs` (default 12s) so the customer-side tracking map has
 *     a fresh pin even when the rider isn't moving.
 *   • The browser Geolocation API only works while the rider's tab is
 *     open + the permission is granted. If permission is denied, we
 *     silently no-op rather than spam the server.
 *   • This hook DOES NOT toggle `isOnline` server-side anymore — the
 *     dashboard owns the explicit `POST /api/riders/status` call so a
 *     page refresh keeps the rider online and a failed toggle rolls
 *     back cleanly in the UI.
 *
 * Returns nothing — the hook is fire-and-forget.
 */
export function useRiderLocationTracking(
  enabled: boolean,
  intervalMs: number = 12_000,
): void {
  // We track the latest lat/lng + watcher id so we can clear it when
  // the rider toggles offline (or the page unmounts).
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const watcherIdRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Going offline — stop the local watcher; the dashboard has
      // already POSTed `/api/riders/status { online: false }` so we
      // don't repeat that here.
      stop();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Browser too old / no geolocation. Server still knows we're
      // online (the dashboard told it via /api/riders/status), we
      // just won't broadcast a pin.
      return;
    }

    function pushCurrent() {
      const last = lastPosRef.current;
      if (!last) return;
      void apiFetch("/api/riders/location", {
        method: "POST",
        body: JSON.stringify({ lat: last.lat, lng: last.lng }),
      }).catch(() => {
        /* keep the watcher alive on transient errors */
      });
    }

    watcherIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPosRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => {
        // Permission denied / GPS unavailable — clear the cached pin
        // and let the next online toggle re-prompt.
        lastPosRef.current = null;
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      },
    );
    tickRef.current = setInterval(pushCurrent, intervalMs);

    return stop;

    function stop() {
      if (
        typeof navigator !== "undefined" &&
        navigator.geolocation &&
        watcherIdRef.current !== null
      ) {
        navigator.geolocation.clearWatch(watcherIdRef.current);
      }
      watcherIdRef.current = null;
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
      }
      tickRef.current = null;
    }
  }, [enabled, intervalMs]);
}
