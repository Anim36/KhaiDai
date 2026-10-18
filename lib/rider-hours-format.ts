// lib/rider-hours-format.ts
//
// Client-safe re-export of the pure formatter the dashboard
// uses. Lives in its own module (no Prisma / no pg import) so
// "use client" components that only need the time-format helper
// don't drag the `pg` driver adapter into the client bundle.
//
// Source of truth: `lib/rider-hours.ts` — keep both copies in
// sync.

/**
 * "3h 25m" formatter for the dashboard's "Hours online today"
 * tile. Returns `"—"` for null/undefined or any session where
 * the rider wasn't online at all.
 */
export function formatHoursMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
