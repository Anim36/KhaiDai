import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * /api/addresses
 *
 *   GET  — list every Address owned by the signed-in customer.
 *          Returns rows in `createdAt desc` order so the most-recently
 *          saved address surfaces first; the `default` flag is the
 *          authoritative source for which one the checkout should
 *          pre-select.
 *
 *   POST — create a new Address for the signed-in customer.
 *          Body:
 *            {
 *              label:      "HOME" | "WORK" | "OTHER"  (defaults to HOME)
 *              fullAddress: string  (required)
 *              city:        string  (required)
 *              area:        string? (optional, e.g. "Dhanmondi")
 *              latitude:    number? (optional, captured from the map picker)
 *              longitude:   number? (optional, captured from the map picker)
 *              isDefault:   boolean? (optional, default false)
 *            }
 *          When `isDefault: true` we clear the previous default in the
 *          same transaction so only one row per user can carry the flag.
 *
 * Auth: CUSTOMER-only. Partners + riders don't have customer addresses.
 */

const LABEL_VALUES = ["HOME", "WORK", "OTHER"] as const;
type Label = (typeof LABEL_VALUES)[number];

type CreateBody = {
  label?: string;
  fullAddress?: unknown;
  city?: unknown;
  area?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  isDefault?: unknown;
};

function safeLabel(v: unknown): Label {
  if (typeof v === "string" && (LABEL_VALUES as readonly string[]).includes(v)) {
    return v as Label;
  }
  return "HOME";
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeBool(v: unknown): boolean {
  return typeof v === "boolean" ? v : false;
}

function safeOptionalStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function safeLat(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeLng(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function shapeAddress(a: {
  id: string;
  label: string;
  fullAddress: string;
  city: string;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  createdAt: Date;
}) {
  return {
    id: a.id,
    label: a.label,
    fullAddress: a.fullAddress,
    city: a.city,
    area: a.area,
    latitude: a.latitude,
    longitude: a.longitude,
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const rows = await prisma.address.findMany({
      where: { userId: auth.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(
      { addresses: rows.map(shapeAddress) },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load addresses" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const fullAddress = safeStr(body.fullAddress);
  const city = safeStr(body.city);
  if (!fullAddress) {
    return NextResponse.json(
      { error: "Full address is required." },
      { status: 400 },
    );
  }
  if (!city) {
    return NextResponse.json(
      { error: "City is required." },
      { status: 400 },
    );
  }

  const label = safeLabel(body.label);
  const area = safeOptionalStr(body.area);
  const latitude = safeLat(body.latitude);
  const longitude = safeLng(body.longitude);
  const makeDefault = safeBool(body.isDefault);

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        // Clear the previous default inside the same transaction so
        // the invariant "at most one default address per user"
        // never gets violated — even under concurrent POSTs.
        await tx.address.updateMany({
          where: { userId: auth.user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: {
          userId: auth.user.id,
          label,
          fullAddress,
          city,
          area,
          latitude,
          longitude,
          isDefault: makeDefault,
        },
      });
    });
    return NextResponse.json({ address: shapeAddress(created) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create address" },
      { status: 500 },
    );
  }
}
