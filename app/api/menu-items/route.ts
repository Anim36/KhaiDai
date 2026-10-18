import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_DATA_URL_CHARS } from "@/lib/upload-limits";
import {
  applyOptionsToMenuItem,
  normaliseOptionsDraft,
} from "@/lib/menu-item-options";

/**
 * POST /api/menu-items
 *
 * Partner-only — creates a new menu item on the **caller's own**
 * restaurant. `restaurantId` is derived from the partner's
 * restaurant (the body is not allowed to set it), so partners
 * cannot push items into somebody else's restaurant.
 *
 * Body (JSON):
 *   {
 *     name:        string  (2-80 chars)
 *     price:       number  (Taka, 1-100000)
 *     category:    string  (2-40 chars; free-form slug)
 *     image?:      string  (URL or data URL)
 *     description?: string (0-500 chars)
 *     available?:  boolean (defaults to true)
 *   }
 *
 *   201 { item }
 *   400 validation error / no restaurant yet
 *   401 missing / invalid token
 *   403 wrong role
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
      { error: "Create your restaurant before adding menu items" },
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

  const {
    name,
    price,
    category,
    image,
    description,
    available,
  } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "name must be 2-80 characters" },
      { status: 400 },
    );
  }
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 100000
  ) {
    return NextResponse.json(
      { error: "price must be a positive number up to 100000" },
      { status: 400 },
    );
  }
  if (
    typeof category !== "string" ||
    category.trim().length < 2 ||
    category.length > 40
  ) {
    return NextResponse.json(
      { error: "category must be 2-40 characters" },
      { status: 400 },
    );
  }

  let normalisedImage: string | null = null;
  if (image !== undefined && image !== null) {
    if (
      typeof image !== "string" ||
      image.length > MAX_MENU_IMAGE_DATA_URL_CHARS
    ) {
      return NextResponse.json(
        {
          error: `image must be a data-URL string up to ${
            MAX_MENU_IMAGE_BYTES / (1024 * 1024)
          } MB`,
        },
        { status: 400 },
      );
    }
    normalisedImage = image.trim() || null;
  }

  let normalisedDescription = "";
  if (description !== undefined && description !== null) {
    if (typeof description !== "string" || description.length > 500) {
      return NextResponse.json(
        { error: "description must be a string up to 500 chars" },
        { status: 400 },
      );
    }
    normalisedDescription = description.trim();
  }

  let availableFlag = true;
  if (available !== undefined) {
    if (typeof available !== "boolean") {
      return NextResponse.json(
        { error: "available must be a boolean" },
        { status: 400 },
      );
    }
    availableFlag = available;
  }

  // Feat 1 — option groups. Same helper the PATCH route uses so
  // the two endpoints can never disagree on validation rules.
  const norm = normaliseOptionsDraft(
    (body as { options?: unknown }).options,
  );
  if (!norm.ok) {
    return NextResponse.json({ error: norm.error }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          name: name.trim(),
          price,
          category: category.trim(),
          image: normalisedImage,
          description: normalisedDescription,
          available: availableFlag,
        },
      });
      if (norm.value.length > 0) {
        await applyOptionsToMenuItem(tx, {
          menuItemId: item.id,
          draft: norm.value,
        });
      }
      return item;
    });
    // Re-read with options included so the response is the same
    // shape PATCH would emit.
    const withOptions = await prisma.menuItem.findUnique({
      where: { id: created.id },
      include: {
        options: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: {
            choices: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            },
          },
        },
      },
    });
    return NextResponse.json({ item: withOptions }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create menu item" },
      { status: 500 },
    );
  }
}
