import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { auditPromoCodeToggle } from "@/lib/audit";

/**
 * PATCH /api/admin/promo-codes/[id]
 *
 * ADMIN-only — toggle `isActive` on any promo code (platform-wide or
 * partner-owned). The endpoint is the admin override: even when a
 * partner's promo expires, an admin can revive it (or vice-versa).
 *
 * Body: `{ isActive: boolean }`
 *
 *   200 { code: { id, isActive }, changed: boolean }
 *   400 missing / wrong-typed `isActive`
 *   401 missing / invalid token
 *   403 wrong role
 *   404 code not found
 *   500 server error
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "ADMIN");
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
  const v = body as Record<string, unknown>;
  if (typeof v.isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive (boolean) is required" },
      { status: 400 },
    );
  }
  const nextActive = v.isActive;

  try {
    const existing = await prisma.promoCode.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        code: true,
        restaurantId: true,
        isActive: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Promo code not found" },
        { status: 404 },
      );
    }
    if (existing.isActive === nextActive) {
      return NextResponse.json(
        {
          code: { id: existing.id, isActive: existing.isActive },
          changed: false,
        },
        { status: 200 },
      );
    }

    const updated = await prisma.promoCode.update({
      where: { id: existing.id },
      data: { isActive: nextActive },
      select: { id: true, isActive: true },
    });

    void auditPromoCodeToggle({
      adminUserId: auth.user.id,
      promoCodeId: existing.id,
      code: existing.code,
      restaurantId: existing.restaurantId,
      wasActive: existing.isActive,
      nowActive: nextActive,
    });

    return NextResponse.json(
      { code: updated, changed: true },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update promo code",
      },
      { status: 500 },
    );
  }
}
