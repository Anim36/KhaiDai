import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  closeStaleRiderOnlineSessions,
  getOnlineSecondsForDay,
} from "@/lib/rider-hours";
import { isAdminVisibleOnline } from "@/lib/rider-presence";
import { recordAuditEvent } from "@/lib/audit";
import { validateZoneInput } from "@/lib/delivery-fee";

/**
 * GET /api/admin/riders/[id]
 *
 * Admin-only. Returns the rider's full detail — identity,
 * vehicle, zone (or null), status (effective online/offline),
 * today's online seconds, recent 10 deliveries, lifetime
 * delivery + earning totals.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userId = params.id;
  try {
    await closeStaleRiderOnlineSessions();
    const profile = await prisma.riderProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        vehicleType: true,
        vehicleRegNumber: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        isOnline: true,
        zoneLat: true,
        zoneLng: true,
        zoneRadiusKm: true,
        zoneAddress: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        },
      },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Rider not found" },
        { status: 404 },
      );
    }
    const todaySeconds = await getOnlineSecondsForDay(profile.id, new Date());
    const recent = await prisma.order.findMany({
      where: { riderId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        total: true,
        deliveryFee: true,
        riderEarning: true,
        createdAt: true,
        restaurant: { select: { name: true } },
      },
    });
    const lifetimeEarning = await prisma.order.aggregate({
      where: { riderId: userId, status: "DELIVERED" },
      _sum: { riderEarning: true, total: true },
      _count: { _all: true },
    });
    return NextResponse.json(
      {
        rider: {
          riderProfileId: profile.id,
          userId: profile.user.id,
          name: profile.user.name,
          email: profile.user.email,
          phone: profile.user.phone,
          vehicle: profile.vehicleType ?? "",
          zone: hasZone(profile)
            ? {
                lat: profile.zoneLat as number,
                lng: profile.zoneLng as number,
                radiusKm: profile.zoneRadiusKm ?? 5,
                address: profile.zoneAddress ?? "",
              }
            : null,
          status: isAdminVisibleOnline(
            {
              isOnline: profile.isOnline,
              lastLocationUpdate: profile.lastLocationUpdate,
            },
            await prisma.order.count({
              where: {
                riderId: profile.user.id,
                status: { in: ["OFFERED_TO_RIDER", "PICKED_UP", "ON_THE_WAY"] },
              },
            }) > 0,
          )
            ? "online"
            : "offline",
          lastSeen: profile.lastLocationUpdate?.toISOString() ?? null,
          createdAt: profile.user.createdAt.toISOString(),
          onlineSecondsToday: todaySeconds,
          lifetimeDeliveries: lifetimeEarning._count._all ?? 0,
          lifetimeEarning:
            lifetimeEarning._sum.riderEarning ??
            Math.round((lifetimeEarning._sum.total ?? 0) * 0.7),
          recentDeliveries: recent.map((o) => ({
            id: o.id,
            restaurant: o.restaurant?.name ?? "Restaurant",
            status: o.status,
            total: o.total,
            deliveryFee: o.deliveryFee,
            riderEarning: o.riderEarning ?? null,
            placedAt: o.createdAt.toISOString(),
          })),
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("admin/riders/[id] GET failed", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load rider",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/riders/[id]
 *
 * Admin-only. Used by the "Change zone" modal. Body:
 *   { lat: number, lng: number, radiusKm?: number, address?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userId = params.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const { lat, lng, address } = body as Record<string, unknown>;
  // `radiusKm` is intentionally ignored — service zones are a
  // fixed 5 km for every rider. See `/api/riders/zone` for the
  // rider-side twin of this rule.
  const validationError = validateZoneInput({ lat, lng });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const normalisedAddress =
    typeof address === "string" && address.trim().length > 0
      ? address.trim().slice(0, 240)
      : `${(lat as number).toFixed(5)}, ${(lng as number).toFixed(5)}`;

  try {
    const previous = await prisma.riderProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        zoneLat: true,
        zoneLng: true,
        zoneRadiusKm: true,
        zoneAddress: true,
      },
    });
    if (!previous) {
      return NextResponse.json(
        { error: "Rider not found" },
        { status: 404 },
      );
    }
    const next = await prisma.riderProfile.update({
      where: { id: previous.id },
      data: {
        zoneLat: lat as number,
        zoneLng: lng as number,
        zoneRadiusKm: 5,
        zoneAddress: normalisedAddress,
      },
      select: {
        id: true,
        zoneLat: true,
        zoneLng: true,
        zoneRadiusKm: true,
        zoneAddress: true,
      },
    });
    await recordAuditEvent({
      userId: auth.user.id,
      action: "RIDER_ZONE_CHANGED",
      entityType: "RiderProfile",
      entityId: previous.id,
      oldValue: {
        zoneLat: previous.zoneLat,
        zoneLng: previous.zoneLng,
        zoneRadiusKm: previous.zoneRadiusKm,
        zoneAddress: previous.zoneAddress,
      },
      newValue: {
        zoneLat: next.zoneLat,
        zoneLng: next.zoneLng,
        zoneRadiusKm: next.zoneRadiusKm,
        zoneAddress: next.zoneAddress,
      },
    });
    return NextResponse.json(
      {
        zone: {
          lat: next.zoneLat,
          lng: next.zoneLng,
          radiusKm: next.zoneRadiusKm ?? 5,
          address: next.zoneAddress ?? "",
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("admin/riders/[id] PATCH failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update zone",
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
