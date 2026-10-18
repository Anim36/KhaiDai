-- ============================================================================
-- কাজ ৩ঘ: Audit Trail / Activity Log
-- ============================================================================
-- Adds an append-only `AuditLog` table that records business-sensitive
-- mutations: order status changes, menu-item deletes, restaurant info
-- updates, promo-code create/delete, etc.
--
-- Schema notes:
--   • `userId` is nullable so system-initiated events (cron, scheduled
--     re-dispatch) can write rows without a fake User.
--   • `entityType` + `entityId` are stored as strings (no FK) so deleting
--     the entity never cascades away its history.
--   • `oldValue` / `newValue` are JSON, so we can record exactly the
--     columns that changed without inventing per-entity audit tables.
--   • Three indexes cover the hot reads: entity drill-down, user
--     activity feed, and global action-type feed.
--
-- Existing rows are not affected — this migration only creates a
-- fresh table and its indices.
-- ============================================================================

-- CreateTable
CREATE TABLE "AuditLog" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT,
    "action"     TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT NOT NULL,
    "oldValue"   JSONB,
    "newValue"   JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
-- onDelete SetNull so removing a User (rare, GDPR-style) keeps the
-- audit history intact, just with the user attribution lost. We
-- care more about WHAT happened than WHO did it for compliance
-- reasons — losing the link is a graceful degradation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_createdAt_idx"
  ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx"
  ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"
  ON "AuditLog"("action", "createdAt");
