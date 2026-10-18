// lib/delivery-fee-math.ts
//
// Pure, client-safe fee math shared by the API routes, the admin
// "Fee calculator" preview, and the customer-facing estimate. Has
// no Prisma / no `pg` import so it bundles cleanly into client
// components.
//
// The DB-backed loader (`loadActiveDeliveryFeeConfig`) lives in
// `lib/delivery-fee.ts` and is intentionally server-only.

import { haversineKmSimple } from "@/lib/geo";

export type DeliveryFeeShape = {
  baseFee: number;
  includedKm: number;
  perKmRate: number;
  minFee: number;
  maxFee: number;
  riderSharePercent: number;
};

/**
 * Apply the platform fee formula to a distance in kilometres.
 *
 *   fee = baseFee + perKmRate × max(0, distanceKm − includedKm)
 *   fee = clamp(fee, minFee, maxFee), rounded to nearest integer.
 */
export function computeDeliveryFee(
  cfg: DeliveryFeeShape,
  distanceKm: number,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return cfg.baseFee;
  }
  const extra = Math.max(0, distanceKm - cfg.includedKm);
  const raw = cfg.baseFee + cfg.perKmRate * extra;
  const clamped = Math.max(cfg.minFee, Math.min(cfg.maxFee, raw));
  return Math.round(clamped);
}

/**
 * Rider share = `fee × riderSharePercent / 100`, rounded.
 */
export function computeRiderEarning(
  cfg: DeliveryFeeShape,
  fee: number,
): number {
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  return Math.round((fee * cfg.riderSharePercent) / 100);
}

/**
 * Convenience: feed it the four coordinates and the config and
 * get back `{ distanceKm, fee, riderEarning }` in one call.
 */
export function quoteDelivery(
  cfg: DeliveryFeeShape,
  restaurantLat: number,
  restaurantLng: number,
  customerLat: number,
  customerLng: number,
): { distanceKm: number; fee: number; riderEarning: number } {
  const distanceKm = haversineKmSimple(
    restaurantLat,
    restaurantLng,
    customerLat,
    customerLng,
  );
  const fee = computeDeliveryFee(cfg, distanceKm);
  const riderEarning = computeRiderEarning(cfg, fee);
  return { distanceKm, fee, riderEarning };
}

export const DEFAULT_DELIVERY_FEE_CONFIG: DeliveryFeeShape = {
  baseFee: 30,
  includedKm: 1.0,
  perKmRate: 10,
  minFee: 30,
  maxFee: 250,
  riderSharePercent: 70,
};

/**
 * Validate a client-submitted zone update. Returns `null` when
 * valid, or a string error message.
 */
export function validateZoneInput(input: {
  lat?: unknown;
  lng?: unknown;
  radiusKm?: unknown;
}): string | null {
  const { lat, lng, radiusKm } = input;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    return "zone latitude must be a finite number between -90 and 90";
  }
  if (
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return "zone longitude must be a finite number between -180 and 180";
  }
  // "Null island" — (0, 0) is technically valid in the range but
  // never a legitimate service zone. A rider who somehow picks
  // it via direct API call gets a 400.
  if (lat === 0 && lng === 0) {
    return "zone cannot be set to 0, 0 — pick a real location";
  }
  if (
    radiusKm !== undefined &&
    radiusKm !== null &&
    (typeof radiusKm !== "number" ||
      !Number.isFinite(radiusKm) ||
      radiusKm <= 0 ||
      radiusKm > 50)
  ) {
    return "zone radiusKm must be a finite number between 0 and 50";
  }
  return null;
}

/**
 * Validate the editable fields of a DeliveryFeeConfig PATCH.
 */
export function validateDeliveryConfigPatch(input: {
  baseFee?: unknown;
  includedKm?: unknown;
  perKmRate?: unknown;
  minFee?: unknown;
  maxFee?: unknown;
  riderSharePercent?: unknown;
}): string | null {
  const num = (v: unknown, label: string) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return `${label} must be a finite number`;
    }
    return null;
  };
  const checks: Array<[string, string | null]> = [
    ["baseFee", num(input.baseFee, "baseFee")],
    ["includedKm", num(input.includedKm, "includedKm")],
    ["perKmRate", num(input.perKmRate, "perKmRate")],
    ["minFee", num(input.minFee, "minFee")],
    ["maxFee", num(input.maxFee, "maxFee")],
    ["riderSharePercent", num(input.riderSharePercent, "riderSharePercent")],
  ];
  for (const [, err] of checks) {
    if (err) return err;
  }
  if (
    typeof input.minFee === "number" &&
    typeof input.maxFee === "number" &&
    input.minFee > input.maxFee
  ) {
    return "minFee must be <= maxFee";
  }
  if (
    typeof input.riderSharePercent === "number" &&
    (input.riderSharePercent < 0 || input.riderSharePercent > 100)
  ) {
    return "riderSharePercent must be between 0 and 100";
  }
  if (
    typeof input.baseFee === "number" &&
    (input.baseFee < 0 || input.baseFee > 1000)
  ) {
    return "baseFee must be between 0 and 1000";
  }
  if (
    typeof input.perKmRate === "number" &&
    (input.perKmRate < 0 || input.perKmRate > 1000)
  ) {
    return "perKmRate must be between 0 and 1000";
  }
  if (
    typeof input.includedKm === "number" &&
    (input.includedKm < 0 || input.includedKm > 50)
  ) {
    return "includedKm must be between 0 and 50";
  }
  return null;
}
