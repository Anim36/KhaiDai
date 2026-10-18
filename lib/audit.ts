import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * lib/audit.ts — single entry point for writing AuditLog rows.
 *
 * Every mutation that needs an audit trail calls `recordAuditEvent`
 * (or one of its typed wrappers below). Centralised so:
 *
 *   1. The wire shape is consistent across events.
 *   2. A future move to async-only or outbox-backed writes only
 *      requires editing this one helper.
 *   3. It's obvious from any call site exactly what's being logged
 *      (the action key + entity type) instead of letting every
 *      route invent its own payload.
 *
 * Failures are swallowed: an audit-log write that fails shouldn't
 * block a successful user action (an order was placed, a menu
 * item was deleted, the user shouldn't see a 500 just because we
 * couldn't write the audit row). The `console.error` makes the
 * failure visible in dev/staging logs.
 *
 * The current call sites (across the platform):
 *
 *   • Order status change      (`/api/orders/[id]` PATCH)
 *   • MenuItem soft-delete     (`/api/menu-items/[id]` DELETE)
 *   • Restaurant info update   (`/api/restaurants/[id]` PATCH)
 *   • PromoCode create         (`/api/partner/promo-codes` POST)
 *   • PromoCode delete         (`/api/partner/promo-codes/[id]` DELETE)
 */

export type AuditAction = string;

export type AuditEntityType = string;

/**
 * Wire shape for `recordAuditEvent`.
 *
 * `oldValue` / `newValue` are typed loosely on purpose: every
 * audited entity has a different shape, and adding a typed wrapper
 * per entity would bloat the file. Callers should serialise to a
 * Prisma-friendly JSON-serialisable value before calling
 * (functions / Dates / BigInts must be stringified first).
 */
export type AuditEventInput = {
  /// Set null for system actions (cron, re-dispatch, etc.).
  userId: string | null;
  /// Namespaced action key, e.g. "ORDER_STATUS_CHANGED".
  action: AuditAction;
  /// Entity kind, e.g. "Order" / "MenuItem" / "PromoCode".
  entityType: AuditEntityType;
  /// The id of the affected row (string id from Prisma).
  entityId: string;
  /// Optional BEFORE snapshot. Omit for "create" events.
  oldValue?: unknown;
  /// Optional AFTER snapshot. Omit for "delete" events.
  newValue?: unknown;
};

/**
 * Write one AuditLog row. Best-effort: a DB failure is logged to
 * stderr but never surfaces to the caller. The route handlers
 * should still `await` so the row is durable before the user
 * sees a success response.
 */
export async function recordAuditEvent(
  input: AuditEventInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue:
          input.oldValue === undefined
            ? null
            : (input.oldValue as PrismaJsonInput),
        newValue:
          input.newValue === undefined
            ? null
            : (input.newValue as PrismaJsonInput),
      },
    });
  } catch (err) {
    console.error("[audit] failed to record event", input.action, err);
  }
}

/**
 * Cheap strong-typing helper for the JSON payload. `Json` in
 * Prisma's generated types is `Prisma.JsonValue`. We reuse that
 * alias indirectly so a wrong shape (e.g. an unfrozen Date)
 * catches at compile time before it bites at runtime.
 */
// Prisma's JSON column accepts `Prisma.JsonValue`; we widen to `any`
// only at the boundary because the helper has to accept whatever
// shape the caller hands us (auditing arbitrary data isn't worth a
// dedicated type per call site). The audit-row consumers all run
// through `unknown` before deserialising, so this widening can't
// escape the helper.
type PrismaJsonInput = any;

/* -------------------------------------------------------------------------- */
/*  Convenience wrappers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Order status changed. Logs the previous and new status, plus
 * the role of the actor so the audit feed can show "Partner
 * accepted this order", "Rider picked up this order", etc.
 */
export async function auditOrderStatusChange(input: {
  userId: string;
  orderId: string;
  fromStatus: string;
  toStatus: string;
  actorRole: "CUSTOMER" | "PARTNER" | "RIDER";
}): Promise<void> {
  await recordAuditEvent({
    userId: input.userId,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: input.orderId,
    oldValue: { status: input.fromStatus },
    newValue: {
      status: input.toStatus,
      actorRole: input.actorRole,
    },
  });
}

/**
 * MenuItem soft-deleted. We log the name + restaurant id so the
 * audit row stays meaningful even after the menu item is later
 * hard-deleted (or restored). The deletion timestamp itself is
 * the AuditLog.createdAt, so we don't duplicate it in `newValue`.
 */
export async function auditMenuItemDelete(input: {
  userId: string;
  menuItemId: string;
  restaurantId: string;
  name: string;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.userId,
    action: "MENU_ITEM_DELETED",
    entityType: "MenuItem",
    entityId: input.menuItemId,
    oldValue: {
      name: input.name,
      restaurantId: input.restaurantId,
    },
  });
}

/**
 * Restaurant info update. We log the diff (only the fields that
 * actually changed). Logging every column on every PATCH would
 * quickly become noisy and inflate the JSON column.
 */
export async function auditRestaurantUpdate(input: {
  userId: string;
  restaurantId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.userId,
    action: "RESTAURANT_INFO_UPDATED",
    entityType: "Restaurant",
    entityId: input.restaurantId,
    oldValue: input.before,
    newValue: input.after,
  });
}

/**
 * PromoCode created. Logs the code + scope so the audit row is
 * readable years later even after the underlying code is deleted.
 */
export async function auditPromoCodeCreate(input: {
  userId: string;
  promoCodeId: string;
  code: string;
  restaurantId: string | null;
  discountType: string;
  discountValue: number;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.userId,
    action: "PROMO_CODE_CREATED",
    entityType: "PromoCode",
    entityId: input.promoCodeId,
    newValue: {
      code: input.code,
      restaurantId: input.restaurantId,
      discountType: input.discountType,
      discountValue: input.discountValue,
    },
  });
}

/**
 * PromoCode deleted. We capture the code + restaurant scope so
 * even after the row is gone you can tell what happened.
 */
export async function auditPromoCodeDelete(input: {
  userId: string;
  promoCodeId: string;
  code: string;
  restaurantId: string | null;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.userId,
    action: "PROMO_CODE_DELETED",
    entityType: "PromoCode",
    entityId: input.promoCodeId,
    oldValue: {
      code: input.code,
      restaurantId: input.restaurantId,
    },
  });
}

/**
 * User suspended / unsuspended by an admin. The audit row carries
 * the previous `isSuspended` boolean + the target's email + role so
 * the entry remains readable after the admin later changes the role
 * or the user is deleted.
 */
export async function auditUserSuspend(input: {
  adminUserId: string;
  targetUserId: string;
  targetEmail: string;
  targetRole: string;
  wasSuspended: boolean;
  nowSuspended: boolean;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.adminUserId,
    action: input.nowSuspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
    entityType: "User",
    entityId: input.targetUserId,
    oldValue: {
      isSuspended: input.wasSuspended,
      email: input.targetEmail,
      role: input.targetRole,
    },
    newValue: { isSuspended: input.nowSuspended },
  });
}

/**
 * Restaurant suspended / unsuspended by an admin. Logs the name +
 * previous flag so the entry is meaningful even after the
 * restaurant is later hard-deleted.
 */
export async function auditRestaurantSuspend(input: {
  adminUserId: string;
  restaurantId: string;
  restaurantName: string;
  wasSuspended: boolean;
  nowSuspended: boolean;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.adminUserId,
    action: input.nowSuspended
      ? "RESTAURANT_SUSPENDED"
      : "RESTAURANT_UNSUSPENDED",
    entityType: "Restaurant",
    entityId: input.restaurantId,
    oldValue: {
      isSuspended: input.wasSuspended,
      name: input.restaurantName,
    },
    newValue: { isSuspended: input.nowSuspended },
  });
}

/**
 * Promo code activated / deactivated by an admin. Logs the code +
 * scope so the entry is meaningful even after the row is later
 * deleted. Distinct from the partner-driven PROMO_CODE_DELETED.
 */
export async function auditPromoCodeToggle(input: {
  adminUserId: string;
  promoCodeId: string;
  code: string;
  restaurantId: string | null;
  wasActive: boolean;
  nowActive: boolean;
}): Promise<void> {
  await recordAuditEvent({
    userId: input.adminUserId,
    action: input.nowActive ? "PROMO_CODE_ACTIVATED" : "PROMO_CODE_DEACTIVATED",
    entityType: "PromoCode",
    entityId: input.promoCodeId,
    oldValue: {
      isActive: input.wasActive,
      code: input.code,
      restaurantId: input.restaurantId,
    },
    newValue: { isActive: input.nowActive },
  });
}
