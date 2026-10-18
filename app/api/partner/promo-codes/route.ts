import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import type { PromoDiscountType } from "@prisma/client";
import { auditPromoCodeCreate } from "@/lib/audit";
import { MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_DATA_URL_CHARS } from "@/lib/upload-limits";

/**
 * GET /api/partner/promo-codes
 *
 * PARTNER-only — returns every promo code scoped to the calling
 * partner's restaurant. Codes created by the platform (or other
 * partners) are deliberately filtered out so the dashboard shows
 * only the partner's own.
 *
 * Codes are returned newest-first so the "just created" row sits
 * at the top of the table.
 *
 *   200 { codes: PartnerPromoCode[] }
 *   401 missing / invalid token
 *   403 wrong role
 *   400 partner has no restaurant yet
 *   500 server error
 */

export async function GET(req: NextRequest) {
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

  try {
    const rows = await prisma.promoCode.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: [{ createdAt: "desc" }],
    });

    const codes = rows.map((p) => ({
      id: p.id,
      code: p.code,
      discountType: p.discountType,
      discountValue: p.discountValue,
      minOrderAmount: p.minOrderAmount,
      maxDiscount: p.maxDiscount,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      isActive: p.isActive,
      usageLimit: p.usageLimit,
      usedCount: p.usedCount,
      createdByPartner: p.createdByPartner,
      createdAt: p.createdAt.toISOString(),
      restaurantId: p.restaurantId,
      imageUrl: p.imageUrl,
      description: p.description,
    }));

    return NextResponse.json({ codes }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list promo codes",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/partner/promo-codes
 *
 * PARTNER-only — creates a new promo code scoped to the calling
 * partner's restaurant. The `restaurantId` is taken from the JWT
 * (clients cannot pick a different restaurant), and the `code` is
 * forced uppercase + uniqueness-checked.
 *
 * Body:
 *   {
 *     code:            string   (2-32 chars, uppercase alphanum + dash)
 *     discountType:    "PERCENTAGE" | "FIXED"
 *     discountValue:   number   (1-100 for PERCENTAGE, >=1 for FIXED)
 *     minOrderAmount?: number   (>=0)
 *     maxDiscount?:    number   (>0, only meaningful for PERCENTAGE)
 *     expiresAt?:      string   (ISO date; null = never)
 *     usageLimit?:     number   (>=1; null = unlimited)
 *   }
 *
 *   201 { code }
 *   400 validation error / no restaurant yet
 *   401 missing / invalid token
 *   403 wrong role
 *   409 code already exists
 *   500 server error
 */
export async function POST(req: NextRequest) {
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

  const v = body as Record<string, unknown>;

  // ---- code -------------------------------------------------------
  if (typeof v.code !== "string") {
    return NextResponse.json(
      { error: "code is required" },
      { status: 400 },
    );
  }
  const code = v.code.trim().toUpperCase();
  if (code.length < 2 || code.length > 32) {
    return NextResponse.json(
      { error: "code must be 2-32 characters" },
      { status: 400 },
    );
  }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return NextResponse.json(
      {
        error:
          "code may only contain uppercase letters, numbers, underscores, and dashes",
      },
      { status: 400 },
    );
  }

  // ---- discountType ------------------------------------------------
  if (v.discountType !== "PERCENTAGE" && v.discountType !== "FIXED") {
    return NextResponse.json(
      { error: 'discountType must be "PERCENTAGE" or "FIXED"' },
      { status: 400 },
    );
  }
  const discountType = v.discountType as PromoDiscountType;

  // ---- discountValue -----------------------------------------------
  if (
    typeof v.discountValue !== "number" ||
    !Number.isFinite(v.discountValue) ||
    !Number.isInteger(v.discountValue) ||
    v.discountValue <= 0
  ) {
    return NextResponse.json(
      { error: "discountValue must be a positive integer" },
      { status: 400 },
    );
  }
  if (discountType === "PERCENTAGE" && v.discountValue > 100) {
    return NextResponse.json(
      { error: "PERCENTAGE discountValue must be 1-100" },
      { status: 400 },
    );
  }

  // ---- optional: minOrderAmount ------------------------------------
  let minOrderAmount: number | null = null;
  if (v.minOrderAmount !== undefined && v.minOrderAmount !== null) {
    if (
      typeof v.minOrderAmount !== "number" ||
      !Number.isFinite(v.minOrderAmount) ||
      !Number.isInteger(v.minOrderAmount) ||
      v.minOrderAmount < 0
    ) {
      return NextResponse.json(
        { error: "minOrderAmount must be a non-negative integer" },
        { status: 400 },
      );
    }
    minOrderAmount = v.minOrderAmount;
  }

  // ---- optional: maxDiscount ---------------------------------------
  let maxDiscount: number | null = null;
  if (v.maxDiscount !== undefined && v.maxDiscount !== null) {
    if (
      typeof v.maxDiscount !== "number" ||
      !Number.isFinite(v.maxDiscount) ||
      !Number.isInteger(v.maxDiscount) ||
      v.maxDiscount <= 0
    ) {
      return NextResponse.json(
        { error: "maxDiscount must be a positive integer" },
        { status: 400 },
      );
    }
    if (discountType === "FIXED") {
      // A FIXED discount already has a fixed value; a cap is
      // meaningless — refuse rather than silently ignore.
      return NextResponse.json(
        { error: "maxDiscount is only meaningful for PERCENTAGE codes" },
        { status: 400 },
      );
    }
    maxDiscount = v.maxDiscount;
  }

  // ---- optional: expiresAt -----------------------------------------
  let expiresAt: Date | null = null;
  if (v.expiresAt !== undefined && v.expiresAt !== null) {
    if (typeof v.expiresAt !== "string") {
      return NextResponse.json(
        { error: "expiresAt must be an ISO date string or null" },
        { status: 400 },
      );
    }
    const d = new Date(v.expiresAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "expiresAt must be a valid ISO date string" },
        { status: 400 },
      );
    }
    expiresAt = d;
  }

  // ---- optional: usageLimit ----------------------------------------
  let usageLimit: number | null = null;
  if (v.usageLimit !== undefined && v.usageLimit !== null) {
    if (
      typeof v.usageLimit !== "number" ||
      !Number.isFinite(v.usageLimit) ||
      !Number.isInteger(v.usageLimit) ||
      v.usageLimit <= 0
    ) {
      return NextResponse.json(
        { error: "usageLimit must be a positive integer" },
        { status: 400 },
      );
    }
    usageLimit = v.usageLimit;
  }

  // ---- optional: imageUrl ------------------------------------------
  // Accept either a data URL (what the partner form posts) or an
  // https/http URL (what an admin might paste in). Cap the data URL
  // length so a malicious caller can't blow up the row size — the
  // cover-image cap is reused here so the same 5 MB envelope is
  // enforced for both surfaces.
  let imageUrl: string | null = null;
  if (v.imageUrl !== undefined && v.imageUrl !== null && v.imageUrl !== "") {
    if (typeof v.imageUrl !== "string") {
      return NextResponse.json(
        { error: "imageUrl must be a string" },
        { status: 400 },
      );
    }
    const raw = v.imageUrl.trim();
    if (raw.length === 0) {
      imageUrl = null;
    } else if (raw.startsWith("data:image/")) {
      if (raw.length > MAX_MENU_IMAGE_DATA_URL_CHARS) {
        return NextResponse.json(
          {
            error: `imageUrl data URL is too large (max ${MAX_MENU_IMAGE_BYTES / (1024 * 1024)} MB)`,
          },
          { status: 400 },
        );
      }
      imageUrl = raw;
    } else if (/^https?:\/\//i.test(raw)) {
      if (raw.length > 2048) {
        return NextResponse.json(
          { error: "imageUrl URL is too long (max 2048 chars)" },
          { status: 400 },
        );
      }
      imageUrl = raw;
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

  // ---- optional: description ---------------------------------------
  // কাজ ৫ — partner-side description support mirrors the admin
  // endpoint. Optional short tagline shown beside the code on the
  // restaurant-detail chip modal + the /offers card. Same 200-char
  // cap on both sides.
  let description: string | null = null;
  if (
    v.description !== undefined &&
    v.description !== null &&
    v.description !== ""
  ) {
    if (typeof v.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string" },
        { status: 400 },
      );
    }
    const d = v.description.trim();
    if (d.length > 200) {
      return NextResponse.json(
        { error: "description must be 200 characters or fewer" },
        { status: 400 },
      );
    }
    description = d;
  }

  // ---- uniqueness --------------------------------------------------
  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json(
      { error: "A promo code with this code already exists" },
      { status: 409 },
    );
  }

  try {
    const created = await prisma.promoCode.create({
      data: {
        code,
        restaurantId: restaurant.id,
        discountType,
        discountValue: v.discountValue,
        minOrderAmount,
        maxDiscount,
        expiresAt,
        usageLimit,
        createdByPartner: true,
        isActive: true,
        imageUrl,
        description,
      },
    });
    void auditPromoCodeCreate({
      userId: auth.user.id,
      promoCodeId: created.id,
      code: created.code,
      restaurantId: created.restaurantId,
      discountType: created.discountType,
      discountValue: created.discountValue,
    });

    return NextResponse.json(
      {
        code: {
          id: created.id,
          code: created.code,
          discountType: created.discountType,
          discountValue: created.discountValue,
          minOrderAmount: created.minOrderAmount,
          maxDiscount: created.maxDiscount,
          expiresAt: created.expiresAt
            ? created.expiresAt.toISOString()
            : null,
          isActive: created.isActive,
          usageLimit: created.usageLimit,
          usedCount: created.usedCount,
          createdByPartner: created.createdByPartner,
          createdAt: created.createdAt.toISOString(),
          restaurantId: created.restaurantId,
          imageUrl: created.imageUrl,
          description: created.description,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create promo code",
      },
      { status: 500 },
    );
  }
}

