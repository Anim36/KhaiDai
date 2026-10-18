-- ============================================================================
-- 20260928044532_rider_zone_sessions_delivery_config
--
-- Adds three resources the rider-side overhaul needs:
--
--   • Zone fields on RiderProfile (zoneLat/zoneLng/zoneRadiusKm/zoneAddress).
--     Nullable for legacy riders; the dashboard surfaces a blocking modal
--     until the rider picks a zone.
--   • RiderOnlineSession — one row per continuous online interval per
--     rider. Lets the dashboard show "Hours Online" from real data and
--     lets the dispatch / admin panel agree on who's effectively online.
--   • DeliveryFeeConfig — single-active-row platform config that the
--     checkout, dispatch and admin delivery settings page all read.
--   • Order snapshot fields (deliveryLat/deliveryLng/distanceKm/
--     riderEarning) so a future config change doesn't rewrite history.
-- ============================================================================

-- Order snapshot fields
ALTER TABLE "Order"
    ADD COLUMN "deliveryLat"  DOUBLE PRECISION,
    ADD COLUMN "deliveryLng"  DOUBLE PRECISION,
    ADD COLUMN "distanceKm"   DOUBLE PRECISION,
    ADD COLUMN "riderEarning" INTEGER;

-- Rider service-zone fields (nullable for legacy rows)
ALTER TABLE "RiderProfile"
    ADD COLUMN "zoneAddress"  TEXT,
    ADD COLUMN "zoneLat"      DOUBLE PRECISION,
    ADD COLUMN "zoneLng"      DOUBLE PRECISION,
    ADD COLUMN "zoneRadiusKm" DOUBLE PRECISION DEFAULT 5;

-- RiderOnlineSession: one row per continuous online interval.
CREATE TABLE "RiderOnlineSession" (
    "id"             TEXT NOT NULL,
    "riderProfileId" TEXT NOT NULL,
    "startedAt"      TIMESTAMP(3) NOT NULL,
    "lastSeenAt"     TIMESTAMP(3) NOT NULL,
    "endedAt"        TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderOnlineSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiderOnlineSession_riderProfileId_startedAt_idx"
    ON "RiderOnlineSession"("riderProfileId", "startedAt");

ALTER TABLE "RiderOnlineSession"
    ADD CONSTRAINT "RiderOnlineSession_riderProfileId_fkey"
    FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- DeliveryFeeConfig (single-active row the admin delivery-settings page
-- edits; older rows kept for audit trail).
CREATE TABLE "DeliveryFeeConfig" (
    "id"                 TEXT NOT NULL,
    "baseFee"            INTEGER NOT NULL,
    "includedKm"         DOUBLE PRECISION NOT NULL,
    "perKmRate"          INTEGER NOT NULL,
    "minFee"             INTEGER NOT NULL,
    "maxFee"             INTEGER NOT NULL,
    "riderSharePercent"  INTEGER NOT NULL,
    "updatedByUserId"    TEXT,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"           BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeliveryFeeConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryFeeConfig_isActive_idx"
    ON "DeliveryFeeConfig"("isActive");

ALTER TABLE "DeliveryFeeConfig"
    ADD CONSTRAINT "DeliveryFeeConfig_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
