import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * POST /api/riders/status
 *
 * Single-purpose toggle for the rider's `isOnline` flag.
 *
 *   • Body: { online: boolean }.
 *   • Requires the rider to have a service zone set (zoneLat +
 *     zoneLng). Without one we reject with 400 — see step 3 of
 *     the rider migration; an online rider without a zone will
 *     never be eligible for dispatch anyway.
 *   • Updates `lastSeenAt` on the most recent open
 *     `RiderOnlineSession` (or creates one when going online from
 *     a clean state). See step 2 of the migration for the
 *     session model.
 *
 * Responses:
 *   200 { isOnline: boolean, zone: { lat, lng, radiusKm, address } }
 *   400 missing/invalid online flag, or zone missing
 *   401 missing / invalid token
 *   403 wrong role
 *   500 server error
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
  const { online } = body as { online?: unknown };
  if (typeof online !== "boolean") {
    return NextResponse.json(
      { error: "online must be a boolean" },
      { status: 400 },
    );
  }

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: auth.user.id },
    select: {
      id: true,
      zoneLat: true,
      zoneLng: true,
      zoneRadiusKm: true,
      zoneAddress: true,
      // ধাপ ৫ — needed to gate the "going online" attempt on
      // verification status.
      verificationStatus: true,
    },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Rider profile missing" },
      { status: 404 },
    );
  }

  // ধাপ ৫ — refuse to flip the rider online until an admin has
  // approved their documents. We let the toggle succeed when the
  // rider is going OFFLINE (so they can recover from a stale
  // "online" state after a rejection).
  if (online && profile.verificationStatus !== "APPROVED") {
    return NextResponse.json(
      {
        error:
          profile.verificationStatus === "REJECTED"
            ? "Your documents were rejected — please re-submit and wait for approval before going online."
            : "Your documents are under review. You'll be able to go online once approved.",
      },
      { status: 403 },
    );
  }

  // Disallow going online without a service zone. The blocking
  // modal on the dashboard catches this first, but the server
  // enforces it too so a request from anywhere cannot bypass.
  if (online && (profile.zoneLat === null || profile.zoneLng === null)) {
    return NextResponse.json(
      {
        error:
          "Set your service zone before going online. Open the dashboard to pick a location.",
      },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.riderProfile.update({
        where: { id: profile.id },
        data: { isOnline: online },
        select: {
          id: true,
          zoneLat: true,
          zoneLng: true,
          zoneRadiusKm: true,
          zoneAddress: true,
          isOnline: true,
        },
      });

      // Open a new session when the rider flips online, or close
      // the existing one when they flip offline. Lazy stale-close
      // (heartbeat 2m+ stale) lives in
      // `closeStaleRiderOnlineSessions` — it's invoked from
      // `getOnlineSecondsForDay` and from the heartbeat route so
      // a session is never left open forever.
      if (online) {
        // First close any pre-existing open session that somehow
        // lingers (shouldn't normally happen, but defensive).
        await tx.riderOnlineSession.updateMany({
          where: { riderProfileId: profile.id, endedAt: null },
          data: { endedAt: now },
        });
        await tx.riderOnlineSession.create({
          data: {
            riderProfileId: profile.id,
            startedAt: now,
            lastSeenAt: now,
          },
        });
      } else {
        await tx.riderOnlineSession.updateMany({
          where: { riderProfileId: profile.id, endedAt: null },
          data: { endedAt: now },
        });
      }

      return next;
    });

    return NextResponse.json(
      {
        isOnline: updated.isOnline,
        zone: {
          lat: updated.zoneLat,
          lng: updated.zoneLng,
          radiusKm: updated.zoneRadiusKm,
          address: updated.zoneAddress,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("riders/status failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update rider status",
      },
      { status: 500 },
    );
  }
}
