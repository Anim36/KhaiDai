-- ============================================================================
-- Profile-change request workflow
-- ============================================================================
-- The rider Settings page has two mailto: placeholders — "Contact KhaiDai
-- support" (Profile section) and "Reach out to support" (Vehicle section).
-- This migration replaces those placeholders with an in-app request flow:
--
--   • POST /api/riders/profile-change-request  → creates a PENDING row.
--   • GET  /api/admin/profile-change-requests   → admin queue.
--   • PATCH /api/admin/profile-change-requests/[id] → APPROVE wipes the
--     matching fields so the rider can re-enter them via PATCH
--     /api/riders/me; REJECT leaves the row for history.
--
-- Only one PENDING row per (userId, requestType) is allowed — enforced in
-- the POST route handler, NOT as a unique index, so a rejected row can
-- coexist with a fresh PENDING attempt by the same rider.
--
-- The new ProfileChangeRequestRole enum only carries RIDER today; the
-- partner equivalent can be added later without a migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ProfileChangeRequestRole" AS ENUM ('RIDER');

CREATE TYPE "ProfileChangeRequestType" AS ENUM ('PROFILE_INFO', 'VEHICLE_INFO');

CREATE TYPE "ProfileChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- 2. ProfileChangeRequest table
-- ---------------------------------------------------------------------------
CREATE TABLE "ProfileChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProfileChangeRequestRole" NOT NULL,
    "requestType" "ProfileChangeRequestType" NOT NULL,
    "note" TEXT,
    "status" "ProfileChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileChangeRequest_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
-- Hot read path for the admin queue (status + type filter, newest first).
CREATE INDEX "ProfileChangeRequest_status_requestType_createdAt_idx"
    ON "ProfileChangeRequest"("status", "requestType", "createdAt");

-- Per-user lookup so /rider/settings can render "Request pending review".
CREATE INDEX "ProfileChangeRequest_userId_requestType_status_idx"
    ON "ProfileChangeRequest"("userId", "requestType", "status");

-- ---------------------------------------------------------------------------
-- 4. Foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE "ProfileChangeRequest"
    ADD CONSTRAINT "ProfileChangeRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfileChangeRequest"
    ADD CONSTRAINT "ProfileChangeRequest_reviewedByAdminId_fkey"
    FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;