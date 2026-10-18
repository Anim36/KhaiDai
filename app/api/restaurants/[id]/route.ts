import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import {
  restaurantToDetail,
  restaurantToListing,
} from "@/lib/restaurants";
import { MAX_COVER_DATA_URL_CHARS, MAX_COVER_BYTES_MB } from "@/lib/upload-limits";
import { liveRestaurant, notSoftDeleted } from "@/lib/soft-delete";
import { auditRestaurantUpdate } from "@/lib/audit";

/**
 * GET /api/restaurants/[id]
 *
 * Public — returns a single restaurant in the **detail** shape used
 * by `/restaurants/[id]` (with menu grouped into categories).
 *
 *   200 { restaurant: RestaurantDetail }
 *   404 unknown id
 *   500 server error
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    // Soft-deleted restaurants act like they're not in the catalogue —
    // a stale URL from before the partner deleted it should 404, not
    // serve a tombstone page.
    //
    // ধাপ ৪ — also 404 on PENDING / REJECTED restaurants. A customer
    // landing on /restaurants/[id] for a not-yet-verified restaurant
    // gets a clean 404 (the partner sees the right error from their
    // own dashboard, where the filter is different).
    const row = await prisma.restaurant.findFirst({
      where: { ...liveRestaurant(), id: params.id },
      include: {
        // Feat 1 — load each menu item's option groups (and their
        // choices) so the customer Detail page can decide whether
        // to open the options modal on Add. Without this nested
        // include, `item.options` is always `undefined` on the
        // client and MenuItemCard silently treats the item as
        // option-free, dropping the user straight into the cart.
        menu: {
          where: { ...notSoftDeleted() },
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
        },
        reviews: {
          where: { kind: "RESTAURANT" },
          select: { rating: true },
        },
        // কাজ ৪ — partner's active promo codes for THIS restaurant.
        // We deliberately do NOT include restaurantId=null rows
        // here because those are platform-wide codes that already
        // show up on the homepage carousel; the chips are scoped to
        // this restaurant specifically. The `now` check filters
        // out codes that have already expired.
        promoCodes: {
          where: {
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            code: true,
            description: true,
            discountType: true,
            discountValue: true,
            minOrderAmount: true,
            maxDiscount: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 },
      );
    }
    const detail = restaurantToDetail(row);
    // কাজ ৪ — surface the restaurant-scoped promo codes directly
    // on the detail payload so the customer-side chip row can read
    // them without a second round-trip. The shape mirrors the
    // existing `RestaurantListingWithPromos` style on the
    // listing endpoint.
    return NextResponse.json(
      { restaurant: { ...detail, promoCodes: row.promoCodes } },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch restaurant" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/restaurants/[id]
 *
 * Owner-only — updates the caller's own restaurant. Any subset of
 * the editable fields may be sent; omitted fields are left alone.
 *
 * Body (all optional, but at least one is required):
 *   { name?, address?, cuisine?, deliveryTime?,
 *     coverImage?, openingHours? }
 *
 * `deliveryFee` is no longer partner-editable; the platform owns
 * the schedule (`DeliveryFeeConfig`). The column on the row is
 * kept for historical data only and the field is silently dropped.
 *
 *   200 { restaurant }
 *   400 validation error / empty body
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

  // Ownership check + existence. We need the two reentry flags so the
  // partner-locking logic below can decide whether the partner is
  // allowed to write each field group.
  const existing = await prisma.restaurant.findUnique({
    where: { id: params.id },
    select: {
      ownerId: true,
      profileNeedsReentry: true,
      locationNeedsReentry: true,
    },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404 },
    );
  }
  if (existing.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only edit your own restaurant" },
      { status: 403 },
    );
  }

  // কাজ ২ — partner "Contact support" lock. Two field groups are
  // gated behind a needs-reentry flag set by an approved
  // ProfileChangeRequest:
  //   • name / coverImage / cuisine          → profileNeedsReentry
  //   • address / latitude / longitude      → locationNeedsReentry
  // Editing any field in a locked group is a 403 with a message that
  // tells the partner how to unlock it. Once the partner saves
  // fresh values for the group, we clear the flag atomically so
  // the lock re-engages on the next session.
  const tryingProfile =
    patch.name !== undefined ||
    patch.cuisine !== undefined ||
    patch.coverImage !== undefined;
  const tryingLocation =
    patch.address !== undefined ||
    patch.latitude !== undefined ||
    patch.longitude !== undefined;
  if (tryingProfile && !existing.profileNeedsReentry) {
    return NextResponse.json(
      {
        error:
          "These details are locked. Contact KhaiDai support to request a change.",
        lock: "RESTAURANT_PROFILE",
      },
      { status: 403 },
    );
  }
  if (tryingLocation && !existing.locationNeedsReentry) {
    return NextResponse.json(
      {
        error:
          "Restaurant location is locked. Contact KhaiDai support to request a change.",
        lock: "RESTAURANT_LOCATION",
      },
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
  if (patch.address !== undefined) {
    if (typeof patch.address !== "string" || patch.address.trim().length < 4) {
      return NextResponse.json(
        { error: "address must be at least 4 chars" },
        { status: 400 },
      );
    }
    data.address = patch.address.trim();
  }
  if (patch.cuisine !== undefined) {
    if (typeof patch.cuisine !== "string" || patch.cuisine.trim().length < 2) {
      return NextResponse.json(
        { error: "cuisine must be a non-empty string" },
        { status: 400 },
      );
    }
    data.cuisine = patch.cuisine.trim();
  }
  if (patch.deliveryTime !== undefined) {
    if (
      typeof patch.deliveryTime !== "number" ||
      patch.deliveryTime < 5 ||
      patch.deliveryTime > 180
    ) {
      return NextResponse.json(
        { error: "deliveryTime must be 5-180" },
        { status: 400 },
      );
    }
    data.deliveryTime = patch.deliveryTime;
  }
  // `deliveryFee` is no longer editable — the platform owns the
  // schedule. We deliberately ignore the field if a stale client
  // sends it so the update still succeeds.
  if (patch.coverImage !== undefined) {
    if (patch.coverImage === null) {
      data.coverImage = null;
    } else if (typeof patch.coverImage === "string") {
      if (patch.coverImage.length > MAX_COVER_DATA_URL_CHARS) {
        return NextResponse.json(
          {
            error: `coverImage must be a data-URL string up to ${MAX_COVER_BYTES_MB} MB`,
          },
          { status: 400 },
        );
      }
      data.coverImage = patch.coverImage.trim() || null;
    } else {
      return NextResponse.json(
        { error: "coverImage must be a string or null" },
        { status: 400 },
      );
    }
  }
  if (patch.openingHours !== undefined) {
    if (typeof patch.openingHours !== "string") {
      return NextResponse.json(
        { error: "openingHours must be a string" },
        { status: 400 },
      );
    }
    data.openingHours = patch.openingHours.trim();
  }
  if (patch.latitude !== undefined) {
    if (patch.latitude === null) {
      data.latitude = null;
    } else if (
      typeof patch.latitude !== "number" ||
      !Number.isFinite(patch.latitude) ||
      patch.latitude < -90 ||
      patch.latitude > 90
    ) {
      return NextResponse.json(
        { error: "latitude must be a finite number or null" },
        { status: 400 },
      );
    } else {
      data.latitude = patch.latitude;
    }
  }
  if (patch.longitude !== undefined) {
    if (patch.longitude === null) {
      data.longitude = null;
    } else if (
      typeof patch.longitude !== "number" ||
      !Number.isFinite(patch.longitude) ||
      patch.longitude < -180 ||
      patch.longitude > 180
    ) {
      return NextResponse.json(
        { error: "longitude must be a finite number or null" },
        { status: 400 },
      );
    } else {
      data.longitude = patch.longitude;
    }
  }

  // Clear the matching reentry flag once the partner saves fresh
  // values for that field group. Only flip when the corresponding
  // fields are present in this patch — a partner who only updates
  // `openingHours` should not accidentally re-engage the lock on
  // a group they haven't touched yet.
  if (tryingProfile && existing.profileNeedsReentry) {
    data.profileNeedsReentry = false;
  }
  if (tryingLocation && existing.locationNeedsReentry) {
    data.locationNeedsReentry = false;
  }

  try {
    const updated = await prisma.restaurant.update({
      where: { id: params.id },
      data,
      include: { menu: true },
    });
    // Capture only the changed fields so the audit row stays
    // meaningful even as the schema grows new columns.
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      before[key] = (existing as unknown as Record<string, unknown>)[key];
      after[key] = (updated as unknown as Record<string, unknown>)[key];
    }
    void auditRestaurantUpdate({
      userId: auth.user.id,
      restaurantId: updated.id,
      before,
      after,
    });
    const listing = await restaurantToListing(updated);
    return NextResponse.json(
      {
        restaurant: {
          ...listing,
          // কাজ ২ — return the freshly-cleared flags so the
          // Settings page can re-render the read-only state
          // without a second fetch.
          profileNeedsReentry: updated.profileNeedsReentry,
          locationNeedsReentry: updated.locationNeedsReentry,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update restaurant" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/restaurants/[id]
 *
 * Owner-only — soft-deletes the restaurant (sets `deletedAt = now()`
 * rather than removing the row). The previous behaviour used
 * `onDelete: Cascade` to wipe every menu item + order, which we no
 * longer want now that historical orders are referenced by
 * AuditLog + Review + OrderItem. Soft-deleting also means a partner
 * who accidentally deletes can be recovered by an admin restore.
 *
 *   204 on success
 *   401 missing / invalid token
 *   403 not the owner
 *   404 unknown id
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

  const existing = await prisma.restaurant.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404 },
    );
  }
  if (existing.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only delete your own restaurant" },
      { status: 403 },
    );
  }
  if (existing.deletedAt !== null) {
    // Idempotent: a re-delete is a no-op success.
    return new NextResponse(null, { status: 204 });
  }

  try {
    await prisma.restaurant.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete restaurant" },
      { status: 500 },
    );
  }
}
