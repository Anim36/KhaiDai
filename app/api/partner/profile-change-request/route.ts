import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

/**
 * POST /api/partner/profile-change-request
 *
 * Partner submits a request to unlock their restaurant's
 * profile / location fields. Mirrors the rider endpoint
 * (`app/api/riders/profile-change-request/route.ts`) but:
 *   - allows only requestType ∈ { RESTAURANT_PROFILE, RESTAURANT_LOCATION }
 *   - resolves the partner's own restaurant and writes it to
 *     `restaurantId` on the request row
 *
 * Body: { requestType: "RESTAURANT_PROFILE" | "RESTAURANT_LOCATION", note?: string }
 *   201 { request: {...} }
 *   400 invalid body
 *   401 unauthenticated
 *   404 partner has no restaurant yet
 *   409 already-pending request for this (restaurantId, requestType)
 *
 * Auth: any signed-in user. Ownership of the restaurant is enforced
 *       via `existing.ownerId === auth.user.id`.
 */
const VALID_TYPES = new Set([
  "RESTAURANT_PROFILE",
  "RESTAURANT_LOCATION",
] as const);

type PartnerRequestType =
  | "RESTAURANT_PROFILE"
  | "RESTAURANT_LOCATION";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const v = (body ?? {}) as Record<string, unknown>;

  if (
    typeof v.requestType !== "string" ||
    !VALID_TYPES.has(v.requestType as PartnerRequestType)
  ) {
    return NextResponse.json(
      {
        error:
          "requestType must be RESTAURANT_PROFILE or RESTAURANT_LOCATION",
      },
      { status: 400 },
    );
  }
  const rawNote = typeof v.note === "string" ? v.note.trim() : "";
  if (rawNote.length > 1000) {
    return NextResponse.json(
      { error: "note must be 1000 characters or fewer" },
      { status: 400 },
    );
  }
  const note = rawNote.length > 0 ? rawNote : null;

  // Resolve the partner's restaurant. The platform currently
  // expects one restaurant per partner user; if that ever changes
  // we'd accept a `restaurantId` in the body.
  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: "No restaurant found for this partner" },
      { status: 404 },
    );
  }

  const requestType = v.requestType as PartnerRequestType;

  try {
    const existingPending = await prisma.profileChangeRequest.findFirst({
      where: {
        restaurantId: restaurant.id,
        requestType,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existingPending) {
      return NextResponse.json(
        {
          error: "You already have a pending request",
          pendingRequestId: existingPending.id,
        },
        { status: 409 },
      );
    }

    const created = await prisma.profileChangeRequest.create({
      data: {
        userId: auth.user.id,
        role: "PARTNER",
        restaurantId: restaurant.id,
        requestType,
        status: "PENDING",
        note,
      },
      select: {
        id: true,
        requestType: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        request: {
          ...created,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("partner profile-change-request create failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to submit profile change request",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/partner/profile-change-request
 *
 * Returns the latest PENDING + REJECTED per requestType for the
 * signed-in partner (so the Settings page can render the same
 * "Request pending review" badge and "We rejected your last
 * request" banner as the rider flow).
 *
 *   200 { latestByType: { RESTAURANT_PROFILE: {...}|null, RESTAURANT_LOCATION: {...}|null } }
 *   401 unauthenticated
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!restaurant) {
    return NextResponse.json(
      {
        latestByType: {
          RESTAURANT_PROFILE: null,
          RESTAURANT_LOCATION: null,
        },
      },
      { status: 200 },
    );
  }

  try {
    const rows = await prisma.profileChangeRequest.findMany({
      where: {
        restaurantId: restaurant.id,
        OR: [{ status: "PENDING" }, { status: "REJECTED" }],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        requestType: true,
        status: true,
        adminNote: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!latest.has(r.requestType)) latest.set(r.requestType, r);
    }

    const payload: Record<string, unknown> = {};
    for (const t of ["RESTAURANT_PROFILE", "RESTAURANT_LOCATION"] as const) {
      const r = latest.get(t);
      payload[t] = r
        ? {
            id: r.id,
            status: r.status,
            adminNote: r.adminNote,
            createdAt: r.createdAt.toISOString(),
            reviewedAt: r.reviewedAt?.toISOString() ?? null,
          }
        : null;
    }

    return NextResponse.json({ latestByType: payload }, { status: 200 });
  } catch (err) {
    console.error("partner profile-change-request list failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load profile change requests",
      },
      { status: 500 },
    );
  }
}