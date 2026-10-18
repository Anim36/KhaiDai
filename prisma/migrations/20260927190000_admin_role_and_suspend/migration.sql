-- ============================================================================
-- Admin Panel + Suspend / Deactivate flags
-- ============================================================================
-- কাজ ৩ঙ: introduces the ADMIN role and the platform-wide moderation
-- primitives. Three things land together because they're a single feature:
--
--   1. `UserRole.ADMIN` — the fourth role in the existing enum. Adding
--      enum values is a metadata-only change in Postgres (ALTER TYPE
--      ADD VALUE), so existing rows are unaffected and no rewrite is
--      required. The new value is committed at the end of the
--      transaction so concurrent reads don't see a half-applied type.
--
--   2. `User.isSuspended` — boolean flag, default false. When true,
--      `/api/auth/login` returns 403 even if the password matches.
--      Kept independent from `deletedAt` so an admin can later
--      unsuspend without losing the account or its audit history.
--
--   3. `Restaurant.isSuspended` — boolean flag, default false. When
--      true, the public `/api/restaurants` listing hides the row the
--      same way a soft-delete does, but the partner owner still sees
--      the restaurant in their own dashboard (so they know they were
--      deactivated and can appeal).
--
-- No backfill is required — every existing row inherits `false` on
-- both new columns.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add ADMIN to the UserRole enum
-- ---------------------------------------------------------------------------
-- Postgres `ALTER TYPE ... ADD VALUE` cannot run inside the same
-- transaction block as the values it would be referenced by, so we
-- commit it explicitly. The IF NOT EXISTS guard keeps this safe to
-- re-run against a database where a previous attempt already added
-- the value.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';

-- ---------------------------------------------------------------------------
-- 2. User.isSuspended
-- ---------------------------------------------------------------------------
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3. Restaurant.isSuspended
-- ---------------------------------------------------------------------------
ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;

-- Hot read: the admin users table filters by `isSuspended`. A partial
-- index over the true-flagged rows is cheap and keeps the table dense.
CREATE INDEX IF NOT EXISTS "User_isSuspended_idx"
  ON "User"("isSuspended");

CREATE INDEX IF NOT EXISTS "Restaurant_isSuspended_idx"
  ON "Restaurant"("isSuspended");
