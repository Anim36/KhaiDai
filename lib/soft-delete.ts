/**
 * lib/soft-delete.ts — standard "ignore soft-deleted rows" helpers.
 *
 * Three models carry a `deletedAt` column as of the schema
 * refactor (customers / partners / restaurants).
 * change: User, Restaurant, MenuItem. Every read against those
 * tables should chain `notSoftDeleted(...)` into its `where` so
 * soft-deleted rows stay invisible. To mark a row as soft-deleted,
 * call `softDeleteStamp()` as the `data` payload of an `update`.
 *
 * The partial index `WHERE "deletedAt" IS NULL` (added in the same
 * migration) makes this filter a cheap index seek rather than a
 * full scan.
 *
 * Usage (spread inline so Prisma's literal-type narrowing stays):
 *
 *   const rows = await prisma.restaurant.findMany({
 *     where: { deletedAt: null, ownerId: auth.user.id },
 *     orderBy: { createdAt: "desc" },
 *   });
 *
 *   // or, when the helper makes the call site shorter:
 *
 *   where: { ...notSoftDeleted(), ownerId: auth.user.id }
 *
 * To soft-delete:
 *
 *   await prisma.menuItem.update({
 *     where: { id },
 *     data: softDeleteStamp(),
 *   });
 */

/**
 * Returns a `where:`-shaped fragment `{ deletedAt: null }`. Designed
 * to be spread inline so the rest of the caller's filter keeps its
 * Prisma literal types (e.g. `mode: "insensitive"` stays
 * `QueryMode`, not plain `string`).
 */
export function notSoftDeleted(): { deletedAt: null } {
  return { deletedAt: null };
}

/**
 * Returns a `where:`-shaped fragment for the customer-facing
 * restaurant query.
 *
 * "Live" now means THREE things:
 *   1. Not soft-deleted (deletedAt IS NULL).
 *   2. Not admin-suspended (isSuspended = false).
 *   3. ধাপ ৪ — Admin verification APPROVED. PENDING or REJECTED
 *      restaurants stay out of the customer catalog; the partner
 *      still sees them in their own dashboard, and admin sees
 *      them on `/admin/verifications`.
 *
 * Spread inline so Prisma's literal-type narrowing stays intact, the
 * same way `notSoftDeleted()` is used.
 */
export function liveRestaurant(): {
  deletedAt: null;
  isSuspended: false;
  verificationStatus: "APPROVED";
} {
  return { deletedAt: null, isSuspended: false, verificationStatus: "APPROVED" };
}

/**
 * `data:`-shaped payload for `update`. `now` is parameterised so
 * tests / backfills can pin a deterministic timestamp.
 */
export function softDeleteStamp(now: Date = new Date()): {
  deletedAt: Date;
} {
  return { deletedAt: now };
}

/**
 * Thrown by API routes when a route handler looks up a row that has
 * been soft-deleted. Map it to 410 Gone at the route boundary.
 */
export class SoftDeletedError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`Row ${id} has been deleted`);
    this.name = "SoftDeletedError";
    this.id = id;
  }
}

/**
 * Run a "find row by id, treat tombstones specially" lookup.
 * Returns `null` when the row genuinely doesn't exist; throws a
 * `SoftDeletedError` when it was soft-deleted. Routes can map
 * `null` → 404 and the error → 410 Gone.
 *
 * Callers pass the Prisma *delegate* they want to use (the result
 * of `prisma.user`, `prisma.restaurant`, etc.) along with the id.
 * Keeping the helper generic keeps the file from growing a per-model
 * version every time we add another soft-deletable entity.
 */
export async function loadLive<
  T extends { id: string; deletedAt: Date | null },
>(
  delegate: {
    findUnique: (args: { where: { id: string } }) => Promise<T | null>;
  },
  id: string,
): Promise<T | null> {
  const row = await delegate.findUnique({ where: { id } });
  if (!row) return null;
  if (row.deletedAt !== null) {
    throw new SoftDeletedError(id);
  }
  return row;
}
