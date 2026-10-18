import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  invalidateDeliveryFeeCache,
  loadActiveDeliveryFeeConfig,
  validateDeliveryConfigPatch,
} from "@/lib/delivery-fee";
import { recordAuditEvent } from "@/lib/audit";

/**
 * GET /api/admin/delivery-config
 *
 *   Admin-only. Returns the currently-active
 *   `DeliveryFeeConfig` row. If none is active the route returns
 *   a synthetic defaults object so the admin page can render
 *   during a clean install.
 *
 * PATCH /api/admin/delivery-config
 *
 *   Admin-only. Validates the patch, writes an audit log entry,
 *   invalidates the cache so checkout / estimates pick the new
 *   numbers up immediately.
 */

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const row = await prisma.deliveryFeeConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!row) {
      return NextResponse.json(
        {
          config: {
            id: null,
            baseFee: 30,
            includedKm: 1,
            perKmRate: 10,
            minFee: 30,
            maxFee: 250,
            riderSharePercent: 70,
            updatedAt: null,
            updatedByUserId: null,
          },
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        config: {
          id: row.id,
          baseFee: row.baseFee,
          includedKm: row.includedKm,
          perKmRate: row.perKmRate,
          minFee: row.minFee,
          maxFee: row.maxFee,
          riderSharePercent: row.riderSharePercent,
          updatedAt: row.updatedAt.toISOString(),
          updatedByUserId: row.updatedByUserId,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("admin/delivery-config GET failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load delivery config",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
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

  const validation = validateDeliveryConfigPatch(patch);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  try {
    const previous = await loadActiveDeliveryFeeConfig();
    const existing = await prisma.deliveryFeeConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    let next: {
      baseFee: number;
      includedKm: number;
      perKmRate: number;
      minFee: number;
      maxFee: number;
      riderSharePercent: number;
      updatedByUserId: string;
      isActive: true;
    };
    if (!existing) {
      next = {
        baseFee: patch.baseFee as number,
        includedKm: patch.includedKm as number,
        perKmRate: patch.perKmRate as number,
        minFee: patch.minFee as number,
        maxFee: patch.maxFee as number,
        riderSharePercent: patch.riderSharePercent as number,
        updatedByUserId: auth.user.id,
        isActive: true,
      };
      await prisma.deliveryFeeConfig.create({ data: next });
    } else {
      next = {
        baseFee: patch.baseFee as number,
        includedKm: patch.includedKm as number,
        perKmRate: patch.perKmRate as number,
        minFee: patch.minFee as number,
        maxFee: patch.maxFee as number,
        riderSharePercent: patch.riderSharePercent as number,
        updatedByUserId: auth.user.id,
        isActive: true,
      };
      await prisma.deliveryFeeConfig.update({
        where: { id: existing.id },
        data: next,
      });
    }

    invalidateDeliveryFeeCache();

    // Audit trail — see step 6 of the migration. Capture both
    // old + new numbers so the admin audit log can show exactly
    // what changed.
    await recordAuditEvent({
      userId: auth.user.id,
      action: "DELIVERY_CONFIG_UPDATED",
      entityType: "DeliveryFeeConfig",
      entityId: existing?.id ?? "new",
      oldValue: previous as unknown as Record<string, unknown>,
      newValue: next as unknown as Record<string, unknown>,
    });

    return NextResponse.json(
      {
        ok: true,
        config: {
          ...next,
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("admin/delivery-config PATCH failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update delivery config",
      },
      { status: 500 },
    );
  }
}
