import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_DATA_URL_CHARS } from "@/lib/upload-limits";
import { auditMenuItemDelete } from "@/lib/audit";
import {
  applyOptionsToMenuItem,
  normaliseOptionsDraft,
} from "@/lib/menu-item-options";

/**
 * PATCH /api/menu-items/[id]
 *
 * Owner-only — updates the named menu item, but only if it
 * belongs to the calling partner's restaurant. Any subset of the
 * editable fields may be sent.
 *
 * Body (all optional, at least one required):
 *   { name?, price?, category?, image?, description?, available? }
 *
 *   200 { item }
 *   400 validation error
 *   401 missing / invalid token
 *   403 not the owner
 *   404 unknown id
 *   500 server error
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const item = await prisma.menuItem.findUnique({
    where: { id: params.id },
    include: { restaurant: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  if (item.restaurant.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only edit your own menu items" },
      { status: 403 },
    );
  }

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string" || patch.name.trim().length < 2) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    data.name = patch.name.trim();
  }
  if (patch.price !== undefined) {
    if (
      typeof patch.price !== "number" ||
      !Number.isFinite(patch.price) ||
      patch.price <= 0 ||
      patch.price > 100000
    ) {
      return NextResponse.json(
        { error: "price must be a positive number up to 100000" },
        { status: 400 },
      );
    }
    data.price = patch.price;
  }
  if (patch.category !== undefined) {
    if (typeof patch.category !== "string" || patch.category.trim().length < 2) {
      return NextResponse.json(
        { error: "category must be a non-empty string" },
        { status: 400 },
      );
    }
    data.category = patch.category.trim();
  }
  if (patch.image !== undefined) {
    if (patch.image === null) {
      data.image = null;
    } else if (typeof patch.image === "string") {
      if (patch.image.length > MAX_MENU_IMAGE_DATA_URL_CHARS) {
        return NextResponse.json(
          {
            error: `image must be a data-URL string up to ${
              MAX_MENU_IMAGE_BYTES / (1024 * 1024)
            } MB`,
          },
          { status: 400 },
        );
      }
      data.image = patch.image.trim() || null;
    } else {
      return NextResponse.json(
        { error: "image must be a string or null" },
        { status: 400 },
      );
    }
  }
  if (patch.description !== undefined) {
    if (typeof patch.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string" },
        { status: 400 },
      );
    }
    data.description = patch.description.trim();
  }
  if (patch.available !== undefined) {
    if (typeof patch.available !== "boolean") {
      return NextResponse.json(
        { error: "available must be a boolean" },
        { status: 400 },
      );
    }
    data.available = patch.available;
  }

  // Feat 1 — option-group reconciliation. The shared helper
  // normalises the draft and reconciles the existing rows inside
  // the caller's transaction. We run this only when the client
  // actually sent the `options` key — a partner toggling just
  // `available` won't accidentally wipe all their options.
  let normalisedOptions: ReturnType<typeof normaliseOptionsDraft> | null = null;
  if (patch.options !== undefined) {
    const n = normaliseOptionsDraft(patch.options);
    if (!n.ok) {
      return NextResponse.json({ error: n.error }, { status: 400 });
    }
    normalisedOptions = n;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u =
        Object.keys(data).length > 0
          ? await tx.menuItem.update({ where: { id: params.id }, data })
          : await tx.menuItem.findUniqueOrThrow({ where: { id: params.id } });
      if (normalisedOptions) {
        await applyOptionsToMenuItem(tx, {
          menuItemId: u.id,
          draft: normalisedOptions.value,
        });
      }
      return u;
    });
    // Re-read with options included so the client modal can
    // round-trip without another fetch.
    const enriched = await prisma.menuItem.findUnique({
      where: { id: updated.id },
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
    return NextResponse.json({ item: enriched }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update menu item" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/menu-items/[id]
 *
 * Owner-only — soft-deletes the menu item (sets `deletedAt = now()`
 * rather than removing the row). Historical OrderItem rows still FK
 * to the menu item id, and `OrderItem.menuItem` is `onDelete:
 * Restrict` anyway, so a hard delete would error — soft-delete
 * matches the desired UX ("this dish is off the menu") and the
 * existing FK semantics.
 *
 * Re-issuing the same DELETE on an already-soft-deleted item is a
 * no-op (idempotent): the row stays deleted, the route still
 * returns 204.
 *
 *   204 on success
 *   401 missing / invalid token
 *   403 not the owner
 *   404 unknown id
 *   410 already soft-deleted (kept around in case the partner hits
 *       DELETE twice in quick succession on a flaky connection)
 *   500 server error
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const item = await prisma.menuItem.findUnique({
    where: { id: params.id },
    include: { restaurant: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  if (item.restaurant.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only delete your own menu items" },
      { status: 403 },
    );
  }

  try {
    await prisma.menuItem.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    void auditMenuItemDelete({
      userId: auth.user.id,
      menuItemId: params.id,
      restaurantId: item.restaurantId,
      name: item.name,
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete menu item" },
      { status: 500 },
    );
  }
}
