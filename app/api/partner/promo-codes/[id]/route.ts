import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { auditPromoCodeDelete } from "@/lib/audit";
import { MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_DATA_URL_CHARS } from "@/lib/upload-limits";

/**
 * PATCH /api/partner/promo-codes/[id]
 *
 * PARTNER-only — edits a single promo code that belongs to the
 * calling partner's restaurant. Any subset of the editable fields
 * may be sent; omitted fields are left alone. Code uniqueness is
 * preserved (changing `code` runs a uniqueness check).
 *
 * Body (all optional, at least one required):
 *   {
 *     code?:           string  (same validation as POST)
 *     discountType?:   "PERCENTAGE" | "FIXED"
 *     discountValue?:  number
 *     minOrderAmount?: number | null
 *     maxDiscount?:    number | null
 *     expiresAt?:      string | null  (ISO date)
 *     usageLimit?:     number | null
 *     isActive?:       boolean
 *   }
 *
 *   200 { code }
 *   400 validation error
 *   401 missing / invalid token
 *   403 wrong role / not the owner
 *   404 unknown id
 *   409 duplicate code
 *   500 server error
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: "Create your restaurant before managing promo codes" },
      { status: 400 },
    );
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
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "At least one field is required" },
      { status: 400 },
    );
  }

  // Ownership check + existence in one query — both conditions
  // surface as separate error statuses for clarity.
  const existing = await prisma.promoCode.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Promo code not found" },
      { status: 404 },
    );
  }
  if (existing.restaurantId !== restaurant.id) {
    return NextResponse.json(
      {
        error:
          "You can only edit promo codes that belong to your own restaurant",
      },
      { status: 403 },
    );
  }

  const data: Record<string, unknown> = {};

  if (patch.code !== undefined) {
    if (typeof patch.code !== "string") {
      return NextResponse.json(
        { error: "code must be a string" },
        { status: 400 },
      );
    }
    const newCode = patch.code.trim().toUpperCase();
    if (newCode.length < 2 || newCode.length > 32) {
      return NextResponse.json(
        { error: "code must be 2-32 characters" },
        { status: 400 },
      );
    }
    if (!/^[A-Z0-9_-]+$/.test(newCode)) {
      return NextResponse.json(
        {
          error:
            "code may only contain uppercase letters, numbers, underscores, and dashes",
        },
        { status: 400 },
      );
    }
    if (newCode !== existing.code) {
      const dup = await prisma.promoCode.findUnique({
        where: { code: newCode },
      });
      if (dup) {
        return NextResponse.json(
          { error: "A promo code with this code already exists" },
          { status: 409 },
        );
      }
      data.code = newCode;
    }
  }

  if (patch.discountType !== undefined) {
    if (
      patch.discountType !== "PERCENTAGE" &&
      patch.discountType !== "FIXED"
    ) {
      return NextResponse.json(
        { error: 'discountType must be "PERCENTAGE" or "FIXED"' },
        { status: 400 },
      );
    }
    data.discountType = patch.discountType;
  }

  if (patch.discountValue !== undefined) {
    if (
      typeof patch.discountValue !== "number" ||
      !Number.isFinite(patch.discountValue) ||
      !Number.isInteger(patch.discountValue) ||
      patch.discountValue <= 0
    ) {
      return NextResponse.json(
        { error: "discountValue must be a positive integer" },
        { status: 400 },
      );
    }
    const targetType =
      (data.discountType as "PERCENTAGE" | "FIXED" | undefined) ??
      existing.discountType;
    if (targetType === "PERCENTAGE" && patch.discountValue > 100) {
      return NextResponse.json(
        { error: "PERCENTAGE discountValue must be 1-100" },
        { status: 400 },
      );
    }
    data.discountValue = patch.discountValue;
  }

  if (patch.minOrderAmount !== undefined) {
    if (patch.minOrderAmount === null) {
      data.minOrderAmount = null;
    } else if (
      typeof patch.minOrderAmount !== "number" ||
      !Number.isFinite(patch.minOrderAmount) ||
      !Number.isInteger(patch.minOrderAmount) ||
      patch.minOrderAmount < 0
    ) {
      return NextResponse.json(
        { error: "minOrderAmount must be a non-negative integer or null" },
        { status: 400 },
      );
    } else {
      data.minOrderAmount = patch.minOrderAmount;
    }
  }

  if (patch.maxDiscount !== undefined) {
    if (patch.maxDiscount === null) {
      data.maxDiscount = null;
    } else if (
      typeof patch.maxDiscount !== "number" ||
      !Number.isFinite(patch.maxDiscount) ||
      !Number.isInteger(patch.maxDiscount) ||
      patch.maxDiscount <= 0
    ) {
      return NextResponse.json(
        { error: "maxDiscount must be a positive integer or null" },
        { status: 400 },
      );
    } else {
      const targetType =
        (data.discountType as "PERCENTAGE" | "FIXED" | undefined) ??
        existing.discountType;
      if (targetType === "FIXED") {
        return NextResponse.json(
          { error: "maxDiscount is only meaningful for PERCENTAGE codes" },
          { status: 400 },
        );
      }
      data.maxDiscount = patch.maxDiscount;
    }
  }

  if (patch.expiresAt !== undefined) {
    if (patch.expiresAt === null) {
      data.expiresAt = null;
    } else if (typeof patch.expiresAt !== "string") {
      return NextResponse.json(
        { error: "expiresAt must be an ISO date string or null" },
        { status: 400 },
      );
    } else {
      const d = new Date(patch.expiresAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "expiresAt must be a valid ISO date string" },
          { status: 400 },
        );
      }
      data.expiresAt = d;
    }
  }

  if (patch.usageLimit !== undefined) {
    if (patch.usageLimit === null) {
      data.usageLimit = null;
    } else if (
      typeof patch.usageLimit !== "number" ||
      !Number.isFinite(patch.usageLimit) ||
      !Number.isInteger(patch.usageLimit) ||
      patch.usageLimit <= 0
    ) {
      return NextResponse.json(
        { error: "usageLimit must be a positive integer or null" },
        { status: 400 },
      );
    } else {
      data.usageLimit = patch.usageLimit;
    }
  }

  if (patch.isActive !== undefined) {
    if (typeof patch.isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400 },
      );
    }
    data.isActive = patch.isActive;
  }

  if (patch.imageUrl !== undefined) {
    if (patch.imageUrl === null || patch.imageUrl === "") {
      data.imageUrl = null;
    } else if (typeof patch.imageUrl !== "string") {
      return NextResponse.json(
        { error: "imageUrl must be a string or null" },
        { status: 400 },
      );
    } else {
      const raw = patch.imageUrl.trim();
      if (raw.length === 0) {
        data.imageUrl = null;
      } else if (raw.startsWith("data:image/")) {
        if (raw.length > MAX_MENU_IMAGE_DATA_URL_CHARS) {
          return NextResponse.json(
            {
              error: `imageUrl data URL is too large (max ${MAX_MENU_IMAGE_BYTES / (1024 * 1024)} MB)`,
            },
            { status: 400 },
          );
        }
        data.imageUrl = raw;
      } else if (/^https?:\/\//i.test(raw)) {
        if (raw.length > 2048) {
          return NextResponse.json(
            { error: "imageUrl URL is too long (max 2048 chars)" },
            { status: 400 },
          );
        }
        data.imageUrl = raw;
      } else {
        return NextResponse.json(
          {
            error:
              "imageUrl must be a data:image/... URL or an http(s) URL",
          },
          { status: 400 },
        );
      }
    }
  }

  try {
    const updated = await prisma.promoCode.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(
      {
        code: {
          id: updated.id,
          code: updated.code,
          discountType: updated.discountType,
          discountValue: updated.discountValue,
          minOrderAmount: updated.minOrderAmount,
          maxDiscount: updated.maxDiscount,
          expiresAt: updated.expiresAt
            ? updated.expiresAt.toISOString()
            : null,
          isActive: updated.isActive,
          usageLimit: updated.usageLimit,
          usedCount: updated.usedCount,
          createdByPartner: updated.createdByPartner,
          createdAt: updated.createdAt.toISOString(),
          restaurantId: updated.restaurantId,
          imageUrl: updated.imageUrl,
        },
      },
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

/**
 * DELETE /api/partner/promo-codes/[id]
 *
 * PARTNER-only — soft-deletes the partner's own promo code. We
 * hard-delete in the partner refactor because PromoCode doesn't carry a
 * `deletedAt` column; the `isActive` toggle is the partner-facing
 * way to "retire" a code, while the delete endpoint removes the
 * row outright so the dashboard list stays clean.
 *
 * Future hardening work can promote this to a soft-delete
 * when PromoCode gains a `deletedAt` column.
 *
 *   204 on success
 *   401 missing / invalid token
 *   403 wrong role / not the owner
 *   404 unknown id
 *   500 server error
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(_req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { ownerId: auth.user.id },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: "Create your restaurant before managing promo codes" },
      { status: 400 },
    );
  }

  const existing = await prisma.promoCode.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Promo code not found" },
      { status: 404 },
    );
  }
  if (existing.restaurantId !== restaurant.id) {
    return NextResponse.json(
      {
        error:
          "You can only delete promo codes that belong to your own restaurant",
      },
      { status: 403 },
    );
  }

  try {
    // Snapshot the row before we drop it so the audit log carries
    // the code text + scope — losing this would make the audit row
    // useless once the underlying PromoCode row is gone.
    await prisma.promoCode.delete({ where: { id: params.id } });
    void auditPromoCodeDelete({
      userId: auth.user.id,
      promoCodeId: params.id,
      code: existing.code,
      restaurantId: existing.restaurantId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete promo code",
      },
      { status: 500 },
    );
  }
}
