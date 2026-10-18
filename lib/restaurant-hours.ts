// lib/restaurant-hours.ts
//
// Helper around `RestaurantOnlineSession`. The shape and intent
// mirror `lib/rider-hours.ts` so the partner dashboard's
// "Today's Active Hours" tile can reuse `formatHoursMinutes`
// (re-exported here for convenience).
//
// Key difference from rider hours: restaurants don't heartbeat, so
// we don't need `closeStaleRiderOnlineSessions` and an open
// session is genuinely "still online". The partner closes it
// explicitly by flipping the toggle off.

import { prisma } from "@/lib/prisma";

const DHAKA_TZ = "Asia/Dhaka";

type SessionLike = {
  startedAt: Date;
  endedAt: Date | null;
};

/**
 * Total seconds the restaurant was online across every session
 * that intersects `dayStart..dayEnd` (Asia/Dhaka local midnight →
 * next local midnight). Sessions spanning the midnight boundary
 * are clipped to each day's contribution.
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
 * date in the Asia/Dhaka timezone.
 *
 *   restaurantId — the Prisma Restaurant.id.
 *   date         — JavaScript Date or ISO string. Only the date
 *                  portion in Asia/Dhaka matters; time-of-day is
 *                  ignored.
 *
 * Returns 0 for unknown restaurant ids or invalid dates.
 */
export async function getRestaurantOnlineSecondsForDay(
  restaurantId: string,
  date: Date | string,
): Promise<number> {
  const refDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(refDate.getTime())) return 0;

  const { dayStartUtc, dayEndUtc } = dhakaDayBoundsUtc(refDate);

  const sessions = await prisma.restaurantOnlineSession.findMany({
    where: {
      restaurantId,
      startedAt: { lt: dayEndUtc },
      OR: [{ endedAt: null }, { endedAt: { gt: dayStartUtc } }],
    },
    select: { startedAt: true, endedAt: true },
  });

  return secondsForDay(sessions, dayStartUtc, dayEndUtc);
}

export { formatHoursMinutes } from "@/lib/rider-hours-format";

/* -------------------------------------------------------------------------- */
/*  Helpers — shared math with rider-hours                                    */
/* -------------------------------------------------------------------------- */

function dhakaDayBoundsUtc(d: Date): {
  dayStartUtc: Date;
  dayEndUtc: Date;
} {
  const partsStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [yStr, mStr, ddStr] = partsStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const dd = Number(ddStr);
  const utcMidnight = Date.UTC(y, m - 1, dd, 0, 0, 0);
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
  const offsetHours = localHour;
  const offsetMinutes = localMinute;
  const shiftMinutes = (offsetHours * 60 + offsetMinutes) % (24 * 60);
  const dayStartUtc = new Date(utcMidnight - shiftMinutes * 60_000);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { dayStartUtc, dayEndUtc };
}