import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * PATCH /api/riders/notification-preferences
 *
 * Updates the signed-in rider's three notification toggles.
 * Used by /rider/settings — the three switches each fire a
 * separate PATCH (one per toggle) so an optimistic UI can flip
 * state per row without batching.
 *
 * Body — partial, all optional, but at least one key required:
 *   { notifyNewRequest?:     boolean,
 *     notifyPayout?:         boolean,
 *     notifyWeeklySummary?:  boolean }
 *
 * Validation:
 *   • All three fields MUST be booleans if present. Anything else
 *     is rejected with 400 so a tampered client can't write
 *     garbage to the row (the Settings UI sends a tight shape).
 *   • The patch is restricted to these three fields. Anything
 *     outside that allowlist is dropped silently — we don't
 *     blindly forward the raw body.
 *
 * Responses:
 *   200 { preferences: { notifyNewRequest, notifyPayout,
 *                          notifyWeeklySummary } }
 *   400 empty body / non-boolean field / unknown key
 *   401 missing / invalid token
 *   403 wrong role
 *   404 rider profile missing
 *   500 server error
 */
const ALLOWED_KEYS = [
  "notifyNewRequest",
  "notifyPayout",
  "notifyWeeklySummary",
] as const;

export async function PATCH(req: NextRequest) {
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

  // Drop unknown keys early so a stray field doesn't end up in the
  // patch object. The presence of at least one allowed key is the
  // "not empty" check.
  const raw = body as Record<string, unknown>;
  const incoming: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) {
    if (k in raw) incoming[k] = raw[k];
  }
  if (Object.keys(incoming).length === 0) {
    return NextResponse.json(
      {
        error:
          "Provide at least one of: notifyNewRequest, notifyPayout, notifyWeeklySummary.",
      },
      { status: 400 },
    );
  }

  // Each provided field must be a boolean. Reject mixed-up payloads
  // (e.g. notifyNewRequest: "yes") rather than coercing them.
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v !== "boolean") {
      return NextResponse.json(
        { error: `${k} must be a boolean` },
        { status: 400 },
      );
    }
  }

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

  try {
    const updated = await prisma.riderProfile.update({
      where: { id: profile.id },
      data: {
        notifyNewRequest: incoming.notifyNewRequest as boolean | undefined,
        notifyPayout: incoming.notifyPayout as boolean | undefined,
        notifyWeeklySummary:
          incoming.notifyWeeklySummary as boolean | undefined,
      },
      select: {
        notifyNewRequest: true,
        notifyPayout: true,
        notifyWeeklySummary: true,
      },
    });
    return NextResponse.json({ preferences: updated }, { status: 200 });
  } catch (err) {
    console.error("riders/notification-preferences PATCH failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save notification preferences",
      },
      { status: 500 },
    );
  }
}
