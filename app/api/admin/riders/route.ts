import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  PRESENCE_STALE_MS,
  isAdminVisibleOnline,
} from "@/lib/rider-presence";
import {
  closeStaleRiderOnlineSessions,
  getOnlineSecondsForDay,
} from "@/lib/rider-hours";

/**
 * GET /api/admin/riders
 *
 * Admin-only overview table of every rider in the system.
 *
 *   Query:
 *     q        — optional, filter by rider name (case-insensitive substring)
 *     status   — optional, "online" | "offline" filter; resolves via
 *                `isEffectivelyOnline(profile, now)`.
 *
 *   Response rows carry:
 *     • identity (id, name, phone, vehicle)
 *     • service zone (or null)
 *     • status badge based on `isEffectivelyOnline`
 *     • "last seen" timestamp from `lastLocationUpdate`
 *     • today's online seconds
 *     • lifetime totals: completed deliveries + earned Taka
 *
 *   200 { riders: RiderRow[] }
 *   401 / 403 / 500 on auth/server failures.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? "";

  try {
    await closeStaleRiderOnlineSessions();

    const where: Record<string, unknown> = {};
    if (q.length > 0) {
      where.user = { name: { contains: q, mode: "insensitive" } };
    }

    const profiles = await prisma.riderProfile.findMany({
      where,
      select: {
        id: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        isOnline: true,
        vehicleType: true,
        zoneLat: true,
        zoneLng: true,
        zoneRadiusKm: true,
        zoneAddress: true,
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    // Bug 1 — collect every riderId that has an in-flight order
    // right now (offered / picked up / on-the-way). A rider mid-
    // delivery whose browser tab dropped off still counts as
    // "online" in the admin panel — see `isAdminVisibleOnline`.
    const inflight = await prisma.order.findMany({
      where: {
        riderId: { not: null },
        status: { in: ["OFFERED_TO_RIDER", "PICKED_UP", "ON_THE_WAY"] },
      },
      select: { riderId: true },
    });
    const inflightRiderIds = new Set(
      inflight.map((o) => o.riderId).filter((v): v is string => Boolean(v)),
    );

    const presenceNow = Date.now();
    const rows: RiderRow[] = await Promise.all(
      profiles.map(async (p) => {
        const effective = isAdminVisibleOnline(
          {
            isOnline: p.isOnline,
            lastLocationUpdate: p.lastLocationUpdate,
          },
          inflightRiderIds.has(p.user.id),
          presenceNow,
        );
        const todaySeconds = await getOnlineSecondsForDay(p.id, new Date());
        const [deliveredCount, lifetimeEarning] = await Promise.all([
          prisma.order.count({
            where: { riderId: p.user.id, status: "DELIVERED" },
          }),
          prisma.order.aggregate({
            where: { riderId: p.user.id, status: "DELIVERED" },
            _sum: { riderEarning: true, total: true },
          }),
        ]);
        const row: RiderRow = {
          riderProfileId: p.id,
          userId: p.user.id,
          name: p.user.name,
          email: p.user.email,
          phone: p.user.phone,
          vehicle: p.vehicleType ?? "",
          zone: hasZone(p)
            ? {
                lat: p.zoneLat as number,
                lng: p.zoneLng as number,
                radiusKm: p.zoneRadiusKm ?? 5,
                address: p.zoneAddress ?? "",
              }
            : null,
          status: effective ? "online" : "offline",
          lastSeen: p.lastLocationUpdate?.toISOString() ?? null,
          onlineSecondsToday: todaySeconds,
          totalDeliveries: deliveredCount,
          totalEarning:
            lifetimeEarning._sum.riderEarning ??
            Math.round((lifetimeEarning._sum.total ?? 0) * 0.7),
        };
        return row;
      }),
    );

    const filtered =
      status === "online"
        ? rows.filter((r) => r.status === "online")
        : status === "offline"
          ? rows.filter((r) => r.status === "offline")
          : rows;

    return NextResponse.json({ riders: filtered }, { status: 200 });
  } catch (err) {
    console.error("admin/riders GET failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load riders",
      },
      { status: 500 },
    );
  }
}

function hasZone(p: {
  zoneLat: number | null;
  zoneLng: number | null;
}): boolean {
  return p.zoneLat !== null && p.zoneLng !== null;
}

export type RiderRow = {
  riderProfileId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  vehicle: string;
  zone: {
    lat: number;
    lng: number;
    radiusKm: number;
    address: string;
  } | null;
  status: "online" | "offline";
  lastSeen: string | null;
  onlineSecondsToday: number;
  totalDeliveries: number;
  totalEarning: number;
};
