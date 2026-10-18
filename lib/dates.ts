// lib/dates.ts
//
// Shared date helpers used by the analytics routes + UI. We
// keep this in one place because the partner / rider / admin
// dashboards all need the same day-bucketing rules and the
// same "Asia/Dhaka" calendar for the rider leaderboard.
//
// All bucketing here uses UTC midnight for the day boundary.
// The rider leaderboard applies its own Asia/Dhaka shift in
// `lib/riders/leaderboard.ts` because Dhaka is UTC+06:00
// with no DST — making that conversion explicit avoids
// off-by-one rankings when a delivery lands near midnight
// Dhaka time.

/**
 * Return "today" at UTC midnight. Lets every caller compute
 * "today" deterministically without `new Date()` inlining.
 */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Parse an ISO-YYYY-MM-DD string. Returns `null` if the input
 * is missing or malformed — callers fall back to a default.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/**
 * Convert a Date to its UTC-midnight key, used everywhere we
 * bucket orders by day. Returns "YYYY-MM-DD".
 */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the [start, end] UTC bounds that bracket the
 * inclusive date range `[from, to]`. `start` is the first
 * millisecond of `from` (00:00:00.000 UTC) and `end` is the
 * last millisecond of `to` (23:59:59.999 UTC).
 */
export function dayRangeUtc(
  from: Date,
  to: Date,
): { startUtc: Date; endUtc: Date } {
  const startUtc = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0),
  );
  const endUtc = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999),
  );
  return { startUtc, endUtc };
}

/**
 * Render a "YYYY-MM-DD" day key in the locale-friendly
 * "12 Apr" form. Used as the chart x-axis label.
 */
export function formatDayLabel(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Render an hour-of-day as "14:00" (24-hour). The chart bars
 * already have a numeric x-axis but a tooltip benefits from a
 * label.
 */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Render a YYYY-MM-DD as "12 Apr 2025" for tables / axis
 * tick lines that need more context than `formatDayLabel`.
 */
export function formatDayLabelLong(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}