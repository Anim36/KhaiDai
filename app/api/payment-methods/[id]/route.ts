import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * /api/payment-methods/[id]
 *
 *   DELETE — remove a SavedPaymentMethod owned by the signed-in
 *            customer. If the row was the default, we promote the
 *            next-most-recent method so the customer is never left
 *            without a default.
 *
 * We don't expose PATCH here — re-typing an account number is the
 * same flow as adding a new one, so we keep the schema narrower.
 *
 * Auth: CUSTOMER-only. The handler always re-checks `userId`
 * against the signed-in user — never trusts the URL segment alone.
 */

type RouteCtx = { params: { id: string } };

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const id = ctx.params.id;
  if (!id) {
    return NextResponse.json(
      { error: "Payment method id is required" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.savedPaymentMethod.findUnique({
        where: { id },
        select: { userId: true, isDefault: true, createdAt: true },
      });
      if (!existing || existing.userId !== auth.user.id) {
        return { ok: false as const };
      }
      await tx.savedPaymentMethod.delete({ where: { id } });
      if (existing.isDefault) {
        const fallback = await tx.savedPaymentMethod.findFirst({
          where: { userId: auth.user.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (fallback) {
          await tx.savedPaymentMethod.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }
      return { ok: true as const };
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Payment method not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete payment method" },
      { status: 500 },
    );
  }
}
