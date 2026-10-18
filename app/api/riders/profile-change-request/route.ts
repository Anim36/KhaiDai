import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * POST /api/riders/profile-change-request
 *
 * Rider submits a request to unlock their profile / vehicle fields.
 * Body:
 *   {
 *     requestType: "PROFILE_INFO" | "VEHICLE_INFO",
 *     note?: string         // optional short reason, ≤ 1000 chars
 *   }
 *
 *   201 { request: { id, requestType, status, createdAt } }
 *   400 invalid body
 *   401 / 403 unauthenticated / wrong role
 *   409 already-pending request for this (userId, requestType)
 *
 * Auth: RIDER only.
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
  const v = (body ?? {}) as Record<string, unknown>;

  if (v.requestType !== "PROFILE_INFO" && v.requestType !== "VEHICLE_INFO") {
    return NextResponse.json(
      {
        error:
          "requestType must be PROFILE_INFO or VEHICLE_INFO",
      },
      { status: 400 },
    );
  }
  const rawNote = typeof v.note === "string" ? v.note.trim() : "";
  const note = rawNote.length > 1000 ? rawNote.slice(0, 1000) : rawNote;
  if (rawNote.length > 1000) {
    return NextResponse.json(
      { error: "note must be 1000 characters or fewer" },
      { status: 400 },
    );
  }

  try {
    // Only one PENDING per (userId, requestType). We check explicitly
    // (instead of via DB unique index) so a rejected request can
    // stay in history while the rider opens a fresh one.
    const existingPending = await prisma.profileChangeRequest.findFirst({
      where: {
        userId: auth.user.id,
        requestType: v.requestType,
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
        role: "RIDER",
        requestType: v.requestType,
        status: "PENDING",
        note: note.length > 0 ? note : null,
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
    console.error("profile-change-request create failed", err);
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
 * GET /api/riders/profile-change-request
 *
 * Returns the latest PENDING request per requestType for the signed-in
 * rider (so the Settings page can render the "Request pending review"
 * badge + the Rejected banner). Used by RiderSettingsPage on mount.
 *
 *   200 { pendingByType: { PROFILE_INFO: {...}|null, VEHICLE_INFO: {...}|null } }
 *   401 / 403
 *
 * Auth: RIDER only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const rows = await prisma.profileChangeRequest.findMany({
      where: {
        userId: auth.user.id,
        OR: [
          { status: "PENDING" },
          // Surface the most-recent rejected one too so the
          // Settings page can show "We rejected your last request —
          // here's why".
          { status: "REJECTED" },
        ],
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

    // Reduce to the most-recent row per requestType. The status
    // badge logic just needs the latest decision.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!latest.has(r.requestType)) latest.set(r.requestType, r);
    }

    const payload: Record<string, unknown> = {};
    for (const t of ["PROFILE_INFO", "VEHICLE_INFO"] as const) {
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

    return NextResponse.json(
      { latestByType: payload },
      { status: 200 },
    );
  } catch (err) {
    console.error("profile-change-request list failed", err);
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