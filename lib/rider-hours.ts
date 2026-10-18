// lib/rider-hours.ts
//
// Helpers around `RiderOnlineSession`. Two responsibilities:
//
//   • `closeStaleRiderOnlineSessions()` — lazy stale-close for any
//     open session whose `lastSeenAt` is older than
//     `PRESENCE_STALE_MS` (see `lib/rider-presence`). The endpoint
//     is idempotent so callers can fire-and-forget on every
//     heartbeat / dashboard load without worrying about locking.
//
//   • `getOnlineSecondsForDay(riderProfileId, date)` — total
//     seconds the rider was online on a given calendar day in the
//     Asia/Dhaka business timezone, splitting any single session
//     that crosses midnight into the two contributing days.
//
// Both functions read directly via `prisma`; the dispatch and admin
// routes invoke `closeStaleRiderOnlineSessions` before reading to
// avoid handing out hours that no longer match reality.

import { prisma } from "@/lib/prisma";
import { PRESENCE_STALE_MS } from "@/lib/rider-presence";

const DHAKA_TZ = "Asia/Dhaka";

/**
 * Close every rider-online session whose `lastSeenAt` is older
 * than `PRESENCE_STALE_MS` ago AND that doesn't have an `endedAt`
 * yet. We stamp `endedAt = lastSeenAt` so the closed interval
 * matches the rider's last-known position.
 *
 * Returns the number of sessions closed. Idempotent.
 */
export async function closeStaleRiderOnlineSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS);
  const stale = await prisma.riderOnlineSession.findMany({
    where: { endedAt: null, lastSeenAt: { lt: cutoff } },
    select: { id: true, lastSeenAt: true },
  });
  if (stale.length === 0) return 0;
  await prisma.$transaction(
    stale.map((s) =>
      prisma.riderOnlineSession.update({
        where: { id: s.id },
        data: { endedAt: s.lastSeenAt },
      }),
    ),
  );
  return stale.length;
}

type SessionLike = {
  startedAt: Date;
  endedAt: Date | null;
  lastSeenAt: Date;
};

/**
 * Total seconds the rider was online across every session that
 * intersects `dayStart..dayEnd` (Asia/Dhaka local midnight → next
 * local midnight). Sessions that span the midnight boundary are
 * clipped to each day's contribution so an overnight rider shows
 * up correctly on both days.
 */
function secondsForDay(
  sessions: SessionLike[],
  dayStartLocal: Date,
  dayEndLocal: Date,
): number {
  let total = 0;
  for (const s of sessions) {
    const sessionEnd = s.endedAt ?? new Date();
    const overlapStart = Math.max(
      s.startedAt.getTime(),
      dayStartLocal.getTime(),
    );
    const overlapEnd = Math.min(sessionEnd.getTime(), dayEndLocal.getTime());
    if (overlapEnd > overlapStart) {
      total += (overlapEnd - overlapStart) / 1000;
    }
  }
  return total;
}

/**
 * Compute online seconds for one day, expressed as a calendar
 * date in the Asia/Dhaka timezone. The helper converts "the
 * `date` argument" to its midnight boundary in Dhaka, then walks
 * every session that overlaps with that window.
 *
 *   date — JavaScript Date or ISO string. Only the date portion
 *   in the Asia/Dhaka timezone matters; time-of-day is ignored.
 *   now  — injectable for tests.
 */
export async function getOnlineSecondsForDay(
  riderProfileId: string,
  date: Date | string,
  now: Date = new Date(),
): Promise<number> {
  await closeStaleRiderOnlineSessions();

  const refDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(refDate.getTime())) return 0;

  // Compute the day start / end in Asia/Dhaka. We use Intl to
  // pull the Y/M/D in that timezone, then build local-midnight
  // Date objects directly (Date.UTC then shift by the timezone
  // offset for that instant).
  const { dayStartUtc, dayEndUtc } = dhakaDayBoundsUtc(refDate);

  // Window includes every session that *started* before day-end
  // and has not been manually closed before day-start. We then
  // let `secondsForDay` clip to the day window.
  const sessions = await prisma.riderOnlineSession.findMany({
    where: {
      riderProfileId,
      startedAt: { lt: dayEndUtc },
      OR: [{ endedAt: null }, { endedAt: { gt: dayStartUtc } }],
    },
    select: { startedAt: true, endedAt: true, lastSeenAt: true },
  });

  return secondsForDay(sessions, dayStartUtc, dayEndUtc);
}

/**
 * Same helper for a window of `days` consecutive days ending on
 * the day that contains `now`. Returned in chronological order
 * so the chart and the admin riders' daily hour tables can
 * render directly.
 */
export async function getOnlineSecondsPerDay(
  riderProfileId: string,
  days: number,
  now: Date = new Date(),
): Promise<Array<{ date: string; seconds: number }>> {
  await closeStaleRiderOnlineSessions();
  const rows: Array<{ date: string; seconds: number }> = [];
  // Walk backwards from today, computing the local-midnight
  // window for each.
  const today = new Date(now);
  for (let i = days - 1; i >= 0; i--) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - i);
    const { dayStartUtc, dayEndUtc } = dhakaDayBoundsUtc(ref);
    const sessions = await prisma.riderOnlineSession.findMany({
      where: {
        riderProfileId,
        startedAt: { lt: dayEndUtc },
        OR: [{ endedAt: null }, { endedAt: { gt: dayStartUtc } }],
      },
      select: { startedAt: true, endedAt: true, lastSeenAt: true },
    });
    const seconds = secondsForDay(sessions, dayStartUtc, dayEndUtc);
    rows.push({ date: toIsoDate(ref), seconds });
  }
  return rows;
}

/**
 * "3h 25m" formatter for the dashboard's "Hours online today"
 * tile. Returns `"—"` for null/undefined or any session where
 * the rider wasn't online at all.
 *
 * Server-friendly re-export of the pure formatter. The actual
 * implementation lives in `lib/rider-hours-format.ts` so client
 * components can import the formatter without dragging the
 * `pg` adapter into the client bundle.
 */
export { formatHoursMinutes } from "@/lib/rider-hours-format";

/**
 * Lower-bound helpers — same math `secondsForDay` uses, kept
 * private because the route-facing helpers above already wrap
 * them.
 */
function dhakaDayBoundsUtc(d: Date): {
  dayStartUtc: Date;
  dayEndUtc: Date;
} {
  // Pull Y/M/D parts in Asia/Dhaka.
  const partsStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "2026-09-28"
  const [yStr, mStr, ddStr] = partsStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const dd = Number(ddStr);
  // Build a Date that represents local midnight in Dhaka on that day.
  // Trick: pretend it's UTC, then find the timezone offset at that
  // instant in Dhaka, and shift. Using the previous approach
  // (Date.UTC → adjust) without depending on Intl offset APIs.
  const utcMidnight = Date.UTC(y, m - 1, dd, 0, 0, 0);
  // Ask what Asia/Dhaka local time is when UTC clock reads that
  // instant. If the formatted hour/minute is wrong relative to UTC,
  // the difference IS the offset.
  const sample = new Date(utcMidnight);
  const localHourParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(sample);
  const localHour = Number(
    localHourParts.find((p) => p.type === "hour")?.value ?? 0,
  );
  const localMinute = Number(
    localHourParts.find((p) => p.type === "minute")?.value ?? 0,
  );
  const offsetHours = localHour - 0; // we're asking for UTC+0
  const offsetMinutes = localMinute - 0;
  // Asia/Dhaka is fixed at UTC+6, so this should be 6. The general
  // trick still works for any (future) daylight-saving timezone.
  const shiftMinutes = (offsetHours * 60 + offsetMinutes) % (24 * 60);
  const dayStartUtc = new Date(utcMidnight - shiftMinutes * 60_000);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { dayStartUtc, dayEndUtc };
}

function toIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}
