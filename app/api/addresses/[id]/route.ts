import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * /api/addresses/[id]
 *
 *   PATCH  — edit an existing Address owned by the signed-in
 *            customer. Body accepts any of `label`, `fullAddress`,
 *            `city`, `area`, `isDefault`; only fields that are
 *            present are updated. When `isDefault: true`, we clear
 *            the previous default inside the same transaction.
 *
 *   DELETE — remove an Address owned by the signed-in customer.
 *            If the deleted row was the default, the next-most-recent
 *            address (by `createdAt desc`) is promoted to default so
 *            the customer is never left without one.
 *
 * Auth: CUSTOMER-only. Each handler verifies that the row's
 * `userId` matches the signed-in customer — never trusts the URL
 * segment alone.
 */

const LABEL_VALUES = ["HOME", "WORK", "OTHER"] as const;
type Label = (typeof LABEL_VALUES)[number];

type PatchBody = {
  label?: unknown;
  fullAddress?: unknown;
  city?: unknown;
  area?: unknown;
  isDefault?: unknown;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeOptionalStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function safeBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

function safeLabel(v: unknown): Label | undefined {
  if (typeof v === "string" && (LABEL_VALUES as readonly string[]).includes(v)) {
    return v as Label;
  }
  return undefined;
}

function shapeAddress(a: {
  id: string;
  label: string;
  fullAddress: string;
  city: string;
  area: string | null;
  isDefault: boolean;
  createdAt: Date;
}) {
  return {
    id: a.id,
    label: a.label,
    fullAddress: a.fullAddress,
    city: a.city,
    area: a.area,
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
  };
}

type RouteCtx = { params: { id: string } };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const id = ctx.params.id;
  if (!id) {
    return NextResponse.json({ error: "Address id is required" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: {
    label?: Label;
    fullAddress?: string;
    city?: string;
    area?: string | null;
    isDefault?: boolean;
  } = {};
  const label = safeLabel(body.label);
  if (label) update.label = label;
  const fullAddress = safeStr(body.fullAddress);
  if (fullAddress) update.fullAddress = fullAddress;
  const city = safeStr(body.city);
  if (city) update.city = city;
  if (Object.prototype.hasOwnProperty.call(body, "area")) {
    update.area = safeOptionalStr(body.area);
  }
  const isDefault = safeBool(body.isDefault);
  if (isDefault !== undefined) update.isDefault = isDefault;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No editable fields provided." },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Verify ownership first so we never accidentally let a
      // customer edit another customer's address.
      const existing = await tx.address.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!existing || existing.userId !== auth.user.id) {
        return null;
      }
      if (update.isDefault === true) {
        await tx.address.updateMany({
          where: { userId: auth.user.id, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({ where: { id }, data: update });
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Address not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ address: shapeAddress(updated) }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update address" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const id = ctx.params.id;
  if (!id) {
    return NextResponse.json({ error: "Address id is required" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.address.findUnique({
        where: { id },
        select: { userId: true, isDefault: true, createdAt: true },
      });
      if (!existing || existing.userId !== auth.user.id) {
        return { ok: false as const };
      }
      await tx.address.delete({ where: { id } });
      // If we just deleted the default, promote the next-most-recent
      // row so the customer is never left defaultless.
      if (existing.isDefault) {
        const fallback = await tx.address.findFirst({
          where: { userId: auth.user.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (fallback) {
          await tx.address.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }
      return { ok: true as const };
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "Address not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete address" },
      { status: 500 },
    );
  }
}
