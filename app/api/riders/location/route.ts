import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { closeStaleRiderOnlineSessions } from "@/lib/rider-hours";

/**
 * POST /api/riders/location
 *
 * Updates the signed-in rider's live-tracking fields. Two parts:
 *
 *   • `lat` / `lng` (numbers, optional) — pushed by the dashboard's
 *     geolocation watcher every ~12s while the rider is online.
 *
 * The flag-only toggle lives on its own route
 * (`/api/riders/status`) so a page refresh keeps the rider online.
 *
 * Body:
 *   {
 *     lat?:       number,  // -90..90
 *     lng?:       number,  // -180..180
 *   }
 *
 * On success we also bump `lastSeenAt` on the rider's open
 * `RiderOnlineSession` so the dispatch + admin panels treat the
 * rider as "effectively online" (see `lib/rider-presence`).
 */

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
  const patch = body as Record<string, unknown>;

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Rider profile missing" },
      { status: 404 },
    );
  }

  const data: Record<string, unknown> = {};

  const wantLat = patch.lat !== undefined && patch.lat !== null;
  const wantLng = patch.lng !== undefined && patch.lng !== null;
  if (wantLat || wantLng) {
    if (typeof patch.lat !== "number" || !Number.isFinite(patch.lat)) {
      return NextResponse.json(
        { error: "lat must be a finite number" },
        { status: 400 },
      );
    }
    if (typeof patch.lng !== "number" || !Number.isFinite(patch.lng)) {
      return NextResponse.json(
        { error: "lng must be a finite number" },
        { status: 400 },
      );
    }
    if (patch.lat < -90 || patch.lat > 90) {
      return NextResponse.json(
        { error: "lat must be between -90 and 90" },
        { status: 400 },
      );
    }
    if (patch.lng < -180 || patch.lng > 180) {
      return NextResponse.json(
        { error: "lng must be between -180 and 180" },
        { status: 400 },
      );
    }
    data.currentLat = patch.lat;
    data.currentLng = patch.lng;
    data.lastLocationUpdate = new Date();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "lat and lng are both required" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.riderProfile.update({
        where: { id: profile.id },
        data,
        select: {
          id: true,
          currentLat: true,
          currentLng: true,
          lastLocationUpdate: true,
          isOnline: true,
        },
      });
      // Refresh the open session so the rider stays "fresh" for
      // dispatch. We do this even when the rider's `isOnline` flag
      // is currently false — the dashboard might be misreporting.
      const now = new Date();
      const updateResult = await tx.riderOnlineSession.updateMany({
        where: { riderProfileId: profile.id, endedAt: null },
        data: { lastSeenAt: now },
      });
      if (updateResult.count === 0 && u.isOnline) {
        // The flag says we're online but no open session exists.
        // Re-open one so future hours calculations include this
        // window.
        await tx.riderOnlineSession.create({
          data: {
            riderProfileId: profile.id,
            startedAt: now,
            lastSeenAt: now,
          },
        });
      }
      return u;
    });
    return NextResponse.json(
      {
        rider: {
          id: updated.id,
          lat: updated.currentLat,
          lng: updated.currentLng,
          lastUpdate: updated.lastLocationUpdate?.toISOString() ?? null,
          isOnline: updated.isOnline,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("riders/location failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update location",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/riders/location — for the rider dashboard to read back the
 * last persisted state (e.g. after a page reload to decide whether to
 * resume the geolocation watcher).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await closeStaleRiderOnlineSessions();

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: auth.user.id },
    select: {
      currentLat: true,
      currentLng: true,
      lastLocationUpdate: true,
      isOnline: true,
      zoneLat: true,
      zoneLng: true,
    },
  });
  return NextResponse.json(
    {
      rider: {
        lat: profile?.currentLat ?? null,
        lng: profile?.currentLng ?? null,
        lastUpdate: profile?.lastLocationUpdate?.toISOString() ?? null,
        isOnline: profile?.isOnline ?? false,
        hasZone: profile?.zoneLat !== null && profile?.zoneLng !== null,
      },
    },
    { status: 200 },
  );
}
