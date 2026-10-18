import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * /api/payment-methods
 *
 *   GET  — list every SavedPaymentMethod owned by the signed-in
 *          customer. The `accountNumber` is returned exactly as
 *          stored (already masked by the POST handler below) so the
 *          client only ever sees the last 4 digits.
 *
 *   POST — save a new wallet/card row. Body:
 *            {
 *              type:          "BKASH" | "NAGAD" | "ROCKET" | "CARD"
 *              accountNumber: string  (raw, **never** stored — we mask it)
 *              isDefault:     boolean? (optional)
 *            }
 *          We strip everything except the last 4 digits before saving,
 *          so even a server-side DB dump never leaks the full PAN.
 *          When `isDefault: true`, we clear the previous default in
 *          the same transaction.
 *
 * Auth: CUSTOMER-only.
 */

const KIND_VALUES = ["BKASH", "NAGAD", "ROCKET", "CARD"] as const;
type Kind = (typeof KIND_VALUES)[number];

type CreateBody = {
  type?: unknown;
  accountNumber?: unknown;
  isDefault?: unknown;
};

function safeKind(v: unknown): Kind | null {
  if (typeof v === "string" && (KIND_VALUES as readonly string[]).includes(v)) {
    return v as Kind;
  }
  return null;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeBool(v: unknown): boolean {
  return typeof v === "boolean" ? v : false;
}

/**
 * Mask an account/card number down to its last 4 digits (digits only).
 *
 * Examples:
 *   "+880 1712-345678" → "•••• 5678"
 *   "4111 1111 1111 4321" → "•••• •••• •••• 4321"
 *   "5678" → "•••• 5678"  (defensive — we always show the masking)
 *
 * We deliberately keep only digits before taking the tail so callers
 * can paste the raw form (with spaces / hyphens) and we still get a
 * consistent display.
 */
function maskAccount(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const tail = digits.slice(-4);
  if (raw.replace(/\D/g, "").length <= 8) {
    // Looks like a mobile wallet number — show short mask.
    return `•••• ${tail}`;
  }
  // Card-length: groups of 4.
  return `•••• •••• •••• ${tail}`;
}

function shapeRow(p: {
  id: string;
  type: string;
  accountNumber: string;
  isDefault: boolean;
  createdAt: Date;
}) {
  return {
    id: p.id,
    type: p.type,
    accountNumber: p.accountNumber,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "CUSTOMER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const rows = await prisma.savedPaymentMethod.findMany({
      where: { userId: auth.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(
      { methods: rows.map(shapeRow) },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load payment methods" },
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
  const kind = safeKind(body.type);
  if (!kind) {
    return NextResponse.json(
      { error: "Payment method type must be BKASH, NAGAD, ROCKET, or CARD." },
      { status: 400 },
    );
  }
  const raw = safeStr(body.accountNumber);
  const masked = maskAccount(raw);
  if (!masked) {
    return NextResponse.json(
      { error: "Account number must contain at least 4 digits." },
      { status: 400 },
    );
  }
  const makeDefault = safeBool(body.isDefault);

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.savedPaymentMethod.updateMany({
          where: { userId: auth.user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.savedPaymentMethod.create({
        data: {
          userId: auth.user.id,
          type: kind,
          accountNumber: masked,
          isDefault: makeDefault,
        },
      });
    });
    return NextResponse.json({ method: shapeRow(created) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add payment method" },
      { status: 500 },
    );
  }
}
