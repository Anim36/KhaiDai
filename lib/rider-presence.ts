// lib/rider-presence.ts
//
// "Presence" abstraction — a thin layer over the rider's persisted
// online state that lets the dispatch logic and the Admin panel
// agree on who's really available.
//
// Background:
//   The DB column `RiderProfile.isOnline` is the rider's *intent*.
//   The browser Geolocation API can't push updates when the tab
//   is closed, so a rider who goes online and then closes the
//   browser / drops the tab never gets `isOnline` flipped back
//   to false by the server. The result is a stale "Online" pin on
//   the customer map and the dispatch queue.
//
// Fix:
//   Treat a rider as "effectively online" only if BOTH
//   `isOnline == true` AND we've seen a location update in the
//   last `PRESENCE_STALE_MS` (default 2 minutes). Anywhere that
//   needs to make a dispatch / display decision uses
//   `isEffectivelyOnline()` instead of `isOnline` directly.
//
//   The admin "riders" page additionally accepts an
//   `hasInFlightOrder` signal: a rider with an active in-flight
//   order (PICKED_UP / OFFERED_TO_RIDER / ON_THE_WAY) is clearly
//   operating — even if their browser tab dropped off and
//   heartbeats stopped — and should show as online. The dispatch
//   queue still requires the heartbeat (we never offer to a rider
//   we can't pin on the map), so this overload is admin-only.

/**
 * Riders who have gone offline longer than this are filtered out
 * of the dispatch queue and rendered as "Offline" in /admin/riders.
 * 2 minutes matches the heartbeat cadence from the dashboard's
 * `useRiderLocationTracking` hook (12s ping → ~10 missed pings
 * before we consider the rider stale).
 */
export const PRESENCE_STALE_MS = 2 * 60 * 1000;

/**
 * Snapshot of the fields `isEffectivelyOnline` cares about. We
 * only require what's needed for the freshness check — callers
 * already have `isOnline` and `lastLocationUpdate` on the row.
 */
export type RiderPresenceInput = {
  isOnline: boolean | null | undefined;
  lastLocationUpdate: Date | string | null | undefined;
};

/**
 * True iff the rider's last location update is fresher than
 * `PRESENCE_STALE_MS` AND they currently say they're online.
 *
 * `Date.now()` is the only "now" source so server + admin-panels
 * stay consistent. Tests can inject `now` when needed.
 */
export function isEffectivelyOnline(
  rider: RiderPresenceInput,
  now: number = Date.now(),
): boolean {
  if (!rider.isOnline) return false;
  const last = rider.lastLocationUpdate;
  if (!last) return false;
  const t = typeof last === "string" ? new Date(last).getTime() : last.getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= PRESENCE_STALE_MS;
}

/**
 * Admin-facing variant. Treats a rider as "online" if the standard
 * presence check passes OR they have an open in-flight delivery (offered,
 * picked up, or on-the-way). The in-flight override exists so the admin
 * panel reflects the operational reality: a rider mid-delivery whose
 * browser tab dropped off is still actively working.
 *
 * `hasInFlightOrder` is computed by the caller from `Order.status`
 * — see `app/api/admin/riders/route.ts`.
 */
export function isAdminVisibleOnline(
  rider: RiderPresenceInput,
  hasInFlightOrder: boolean,
  now: number = Date.now(),
): boolean {
  if (isEffectivelyOnline(rider, now)) return true;
  return rider.isOnline === true && hasInFlightOrder;
}
