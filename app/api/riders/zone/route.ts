import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { validateZoneInput } from "@/lib/delivery-fee";

/**
 * GET /api/riders/zone
 *
 *   Reads the signed-in rider's service zone (or null).
 *   Used by the dashboard's blocking modal on first load.
 *
 * PUT /api/riders/zone
 *
 *   Sets the signed-in rider's service zone. Idempotent. The
 *   validation covers lat / lng ranges (block obvious bogus
 *   pairs even if the application code is bypassed) and a
 *   sensible 0–50 km radius window.
 *
 * Responses:
 *   200 { zone: { lat, lng, radiusKm, address } }    GET, PUT
 *   200 { zone: null }                                GET when not set
 *   400 validation error
 *   401 missing / invalid token
 *   403 wrong role
 *   404 unknown rider profile
 *   500 server error
 */

async function loadZone(userId: string) {
  return prisma.riderProfile.findUnique({
    where: { userId },
    select: {
      zoneLat: true,
      zoneLng: true,
      zoneRadiusKm: true,
      zoneAddress: true,
    },
  });
}

function shapeZone(p: {
  zoneLat: number | null;
  zoneLng: number | null;
  zoneRadiusKm: number | null;
  zoneAddress: string | null;
}) {
  if (p.zoneLat === null || p.zoneLng === null) return null;
  return {
    lat: p.zoneLat,
    lng: p.zoneLng,
    radiusKm: p.zoneRadiusKm ?? 5,
    address: p.zoneAddress ?? "",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const profile = await loadZone(auth.user.id);
    if (!profile) {
      return NextResponse.json(
        { error: "Rider profile missing" },
        { status: 404 },
      );
    }
    return NextResponse.json({ zone: shapeZone(profile) }, { status: 200 });
  } catch (err) {
    console.error("riders/zone GET failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load zone",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
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
  const { lat, lng, address } = body as Record<string, unknown>;
  // `radiusKm` is intentionally NOT read from the body — the
  // service zone is a fixed 5 km for every rider regardless of
  // what the client sends. This is the canonical source of truth
  // for "no future rider tier can sneak in a larger zone via the
  // browser console".
  const validationError = validateZoneInput({ lat, lng });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const normalisedAddress =
    typeof address === "string" && address.trim().length > 0
      ? address.trim().slice(0, 240)
      : `${(lat as number).toFixed(5)}, ${(lng as number).toFixed(5)}`;

  try {
    const existing = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Rider profile missing" },
        { status: 404 },
      );
    }
    const updated = await prisma.riderProfile.update({
      where: { id: existing.id },
      data: {
        zoneLat: lat as number,
        zoneLng: lng as number,
        // Always 5 km — see header comment.
        zoneRadiusKm: 5,
        zoneAddress: normalisedAddress,
      },
      select: {
        zoneLat: true,
        zoneLng: true,
        zoneRadiusKm: true,
        zoneAddress: true,
      },
    });
    return NextResponse.json(
      { zone: shapeZone(updated) },
      { status: 200 },
    );
  } catch (err) {
    console.error("riders/zone PUT failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save zone",
      },
      { status: 500 },
    );
  }
}
