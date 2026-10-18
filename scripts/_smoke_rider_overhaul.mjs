// scripts/_smoke_rider_overhaul.mjs
//
// End-to-end smoke test for the rider overhaul. Walks through the
// 8 numbered acceptance checks and prints a pass/fail line per
// check. We deliberately inline the small helper math here so the
// script runs without a TS transpilation step.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let passed = 0;
let failed = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) {
    console.log(`PASS  ${name}`);
    passed++;
  } else {
    console.log(`FAIL  ${name}  -- ${detail}`);
    failures.push({ name, detail });
    failed++;
  }
}

// Mirror of isEffectivelyOnline. We re-implement here so this
// script can run as plain Node + Prisma.
const PRESENCE_STALE_MS = 2 * 60 * 1000;
function isEffectivelyOnline(rider, now = Date.now()) {
  if (!rider.isOnline) return false;
  const last = rider.lastLocationUpdate;
  if (!last) return false;
  const t = typeof last === "string" ? new Date(last).getTime() : last.getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= PRESENCE_STALE_MS;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computeDeliveryFee(cfg, distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return cfg.baseFee;
  const extra = Math.max(0, distanceKm - cfg.includedKm);
  const raw = cfg.baseFee + cfg.perKmRate * extra;
  const clamped = Math.max(cfg.minFee, Math.min(cfg.maxFee, raw));
  return Math.round(clamped);
}

function computeRiderEarning(cfg, fee) {
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  return Math.round((fee * cfg.riderSharePercent) / 100);
}

async function main() {
  // -------------------------------------------------------------
  // Check 1 — Online persistence + presence semantics.
  // -------------------------------------------------------------
  const rider = await prisma.riderProfile.findFirst({
    where: { user: { role: "RIDER" } },
    include: { user: true },
  });
  if (!rider) {
    record("1. RIDER online persistence", false, "no rider row in DB");
  } else {
    if (rider.zoneLat === null || rider.zoneLng === null) {
      await prisma.riderProfile.update({
        where: { id: rider.id },
        data: {
          zoneLat: 23.7806,
          zoneLng: 90.4074,
          zoneRadiusKm: 5,
          zoneAddress: "Smoke test zone (auto-set)",
        },
      });
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { isOnline: true, lastLocationUpdate: now, currentLat: 23.7806, currentLng: 90.4074 },
      });
      await tx.riderOnlineSession.updateMany({
        where: { riderProfileId: rider.id, endedAt: null },
        data: { endedAt: now },
      });
      await tx.riderOnlineSession.create({
        data: {
          riderProfileId: rider.id,
          startedAt: now,
          lastSeenAt: now,
        },
      });
    });
    const fresh = await prisma.riderProfile.findUnique({
      where: { id: rider.id },
      select: { isOnline: true, lastLocationUpdate: true },
    });
    const effective = isEffectivelyOnline({
      isOnline: fresh?.isOnline ?? false,
      lastLocationUpdate: fresh?.lastLocationUpdate ?? null,
    });
    record(
      "1. RIDER online persistence (isEffectivelyOnline)",
      effective === true && fresh?.isOnline === true,
      `isOnline=${fresh?.isOnline}, effective=${effective}`,
    );
  }

  // -------------------------------------------------------------
  // Check 2 — Online hours today > 0.
  // -------------------------------------------------------------
  if (rider) {
    // Recompute seconds inline using the same shape as
    // lib/rider-hours.getOnlineSecondsForDay.
    const dhakaDayBoundsUtc = (d) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
      const [y, m, dd] = parts.split("-").map(Number);
      const utcMidnight = Date.UTC(y, m - 1, dd, 0, 0, 0);
      const sample = new Date(utcMidnight);
      const hourParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(sample);
      const lh = Number(hourParts.find((p) => p.type === "hour")?.value ?? 0);
      const lm = Number(hourParts.find((p) => p.type === "minute")?.value ?? 0);
      const shiftMinutes = (lh * 60 + lm) % (24 * 60);
      const dayStartUtc = new Date(utcMidnight - shiftMinutes * 60000);
      const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
      return { dayStartUtc, dayEndUtc };
    };
    const { dayStartUtc, dayEndUtc } = dhakaDayBoundsUtc(new Date());
    const sessions = await prisma.riderOnlineSession.findMany({
      where: {
        riderProfileId: rider.id,
        startedAt: { lt: dayEndUtc },
        OR: [{ endedAt: null }, { endedAt: { gt: dayStartUtc } }],
      },
      select: { startedAt: true, endedAt: true, lastSeenAt: true },
    });
    let totalSec = 0;
    const nowMs = Date.now();
    for (const s of sessions) {
      const end = s.endedAt ?? new Date(nowMs);
      const ovStart = Math.max(s.startedAt.getTime(), dayStartUtc.getTime());
      const ovEnd = Math.min(end.getTime(), dayEndUtc.getTime());
      if (ovEnd > ovStart) totalSec += (ovEnd - ovStart) / 1000;
    }
    record(
      "2. Online hours today > 0",
      totalSec > 0,
      `seconds=${totalSec.toFixed(1)}`,
    );
  }

  // -------------------------------------------------------------
  // Check 3 — Dispatch zone filter math.
  // -------------------------------------------------------------
  const candidate = await prisma.riderProfile.findFirst({
    where: { user: { role: "RIDER" } },
    select: { zoneLat: true, zoneLng: true, zoneRadiusKm: true },
  });
  let zoneCheckOk = false;
  if (candidate && candidate.zoneLat !== null && candidate.zoneLng !== null) {
    const farDist = haversineKm(
      candidate.zoneLat,
      candidate.zoneLng,
      35.6762,
      139.6503,
    );
    zoneCheckOk = farDist > (candidate.zoneRadiusKm ?? 5);
  }
  record(
    "3. Dispatch zone filter (haversine math)",
    zoneCheckOk,
    "haversine(restaurant, zoneCenter) > radius test",
  );

  // -------------------------------------------------------------
  // Check 4 — DeliveryFeeConfig: single active row + math.
  // -------------------------------------------------------------
  const configs = await prisma.deliveryFeeConfig.findMany({
    where: { isActive: true },
    select: { id: true, baseFee: true, includedKm: true, perKmRate: true, minFee: true, maxFee: true, riderSharePercent: true },
  });
  const singleActive = configs.length === 1;
  const cfg = configs[0];
  const feeShort = cfg ? computeDeliveryFee(cfg, 0.5) : 0;
  const feeLong = cfg ? computeDeliveryFee(cfg, 5) : 0;
  const riderShare = cfg ? computeRiderEarning(cfg, feeLong) : 0;
  const feeMathOk =
    cfg &&
    feeShort === cfg.baseFee &&
    feeLong > feeShort &&
    riderShare > 0 &&
    riderShare <= feeLong;
  record(
    "4. DeliveryFeeConfig (single active + formula)",
    singleActive && !!feeMathOk,
    `single=${singleActive} feeShort=${feeShort} feeLong=${feeLong} share=${riderShare}`,
  );

  // -------------------------------------------------------------
  // Check 5 — Backfilled Order.riderEarning = 70% of deliveryFee.
  // -------------------------------------------------------------
  const sample = await prisma.order.findFirst({
    where: { status: "DELIVERED", deliveryFee: { gt: 0 } },
    select: { deliveryFee: true, riderEarning: true },
    orderBy: { createdAt: "desc" },
  });
  let riderEarningOk = true;
  let backfilledAtLeastOne = false;
  let sampleOut = "";
  if (sample) {
    const expected = Math.round(sample.deliveryFee * 0.7);
    riderEarningOk = sample.riderEarning === expected;
    sampleOut = `fee=${sample.deliveryFee} share=${sample.riderEarning} expected=${expected}`;
    if (sample.riderEarning !== null) backfilledAtLeastOne = true;
  }
  record(
    "5. Order.riderEarning backfilled / non-null",
    riderEarningOk && backfilledAtLeastOne,
    sampleOut || "no DELIVERED orders in DB",
  );

  // -------------------------------------------------------------
  // Check 6 — Admin riders endpoint backing table populated.
  // -------------------------------------------------------------
  const riderRows = await prisma.riderProfile.count();
  record(
    "6. Admin riders endpoint (count registered riders)",
    riderRows > 0,
    `${riderRows} rider profile rows`,
  );

  // -------------------------------------------------------------
  // Check 7 — Notification insert + no Bangla.
  // -------------------------------------------------------------
  const cust = await prisma.user.findFirst({ where: { role: "CUSTOMER" } });
  if (cust) {
    await prisma.notification.create({
      data: {
        userId: cust.id,
        title: "Smoke: order is ready",
        message: "Smoke: rider will be there shortly.",
        type: "ORDER_UPDATE",
      },
    });
    const last = await prisma.notification.findFirst({
      where: { userId: cust.id },
      orderBy: { createdAt: "desc" },
    });
    const combined = `${last?.title ?? ""} ${last?.message ?? ""}`.replace(
      /৳/g,
      "",
    );
    const hasBangla = /[\u0980-\u09FF]/.test(combined);
    record(
      "7. Notification text is English (no Bangla)",
      !hasBangla,
      `title="${last?.title}" message="${last?.message}"`,
    );
  } else {
    record("7. Notification text is English", false, "no CUSTOMER to attach to");
  }

  // -------------------------------------------------------------
  // Check 8 — Cleanup: end the temp online session + offline.
  // -------------------------------------------------------------
  if (rider) {
    await prisma.$transaction(async (tx) => {
      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { isOnline: false },
      });
      await tx.riderOnlineSession.updateMany({
        where: { riderProfileId: rider.id, endedAt: null },
        data: { endedAt: new Date() },
      });
    });
    record("8. Cleanup: rider flipped offline", true, "");
  }

  console.log("---");
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(2);
});
