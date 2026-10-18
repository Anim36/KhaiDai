// lib/delivery-fee.ts
//
// Server-only entrypoint that pulls the active DeliveryFeeConfig
// row out of Prisma (with caching) and forwards to the pure math
// helpers in `lib/delivery-fee-math.ts`. The math module is the
// client-safe counterpart — "use client" components must import
// from there so the `pg` driver adapter doesn't leak into the
// client bundle.
//
// API route callers can keep importing from `@/lib/delivery-fee`
// for the `loadActiveDeliveryFeeConfig` + `invalidateDeliveryFeeCache`
// helpers without change.

import { prisma } from "@/lib/prisma";
import type { DeliveryFeeShape } from "@/lib/delivery-fee-math";

export type { DeliveryFeeShape };
export {
  DEFAULT_DELIVERY_FEE_CONFIG,
  computeDeliveryFee,
  computeRiderEarning,
  quoteDelivery,
  validateZoneInput,
  validateDeliveryConfigPatch,
} from "@/lib/delivery-fee-math";

let cached: { value: DeliveryFeeShape; ts: number } | null = null;
const CACHE_MS = 30_000;

/**
 * Loader — pulls the active config row with a thin cached read.
 * Falls back to a hard-coded default if no row is present (e.g.
 * the seed script never ran) so the checkout can't break.
 */
export async function loadActiveDeliveryFeeConfig(): Promise<DeliveryFeeShape> {
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_MS) return cached.value;
  try {
    const row = await prisma.deliveryFeeConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: {
        baseFee: true,
        includedKm: true,
        perKmRate: true,
        minFee: true,
        maxFee: true,
        riderSharePercent: true,
      },
    });
    if (!row) {
      const { DEFAULT_DELIVERY_FEE_CONFIG } = await import(
        "@/lib/delivery-fee-math"
      );
      cached = { value: DEFAULT_DELIVERY_FEE_CONFIG, ts: now };
      return DEFAULT_DELIVERY_FEE_CONFIG;
    }
    cached = { value: row, ts: now };
    return row;
  } catch {
    const { DEFAULT_DELIVERY_FEE_CONFIG } = await import(
      "@/lib/delivery-fee-math"
    );
    return DEFAULT_DELIVERY_FEE_CONFIG;
  }
}

/** Drop the cache; useful from the admin route after a write. */
export function invalidateDeliveryFeeCache(): void {
  cached = null;
}
