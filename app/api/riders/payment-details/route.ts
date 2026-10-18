import { NextRequest, NextResponse } from "next/server";
import type { PayoutMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * GET /api/riders/payment-details
 *
 * Returns the signed-in rider's list of saved payment accounts.
 * The Settings page reads this on mount so the form fields reflect
 * whatever the rider saved previously.
 *
 *   200  { accounts: Array<{ id, label, method, destination,
 *                            accountHolder, isDefault }> }
 *   401  missing / invalid token
 *   403  wrong role
 *   500  server error
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: {
        paymentAccounts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            method: true,
            destination: true,
            accountHolder: true,
            isDefault: true,
          },
        },
      },
    });
    return NextResponse.json(
      { accounts: profile?.paymentAccounts ?? [] },
      { status: 200 },
    );
  } catch (err) {
    console.error("riders/payment-details GET failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load payment accounts",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/riders/payment-details
 *
 * Create a new payment account for the signed-in rider. If
 * `isDefault` is true (or no other account exists) the new row is
 * marked as the default. Other accounts are demoted to
 * `isDefault = false` so only one default survives.
 *
 * Body (JSON):
 *   {
 *     label:          string,     // 1-60 chars
 *     method:         "BKASH" | "NAGAD" | "ROCKET" | "CARD",
 *     destination:    string,     // phone / last 4 of card, 3-32 chars
 *     accountHolder:  string,     // 2-80 chars
 *     isDefault?:     boolean,
 *   }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
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

  const label = typeof patch.label === "string" ? patch.label.trim() : "";
  if (label.length < 1 || label.length > 60) {
    return NextResponse.json(
      { error: "label must be 1-60 characters" },
      { status: 400 },
    );
  }
  const VALID_METHODS: PayoutMethod[] = [
    "BKASH",
    "NAGAD",
    "ROCKET",
    "CARD",
  ];
  const methodRaw = patch.method;
  if (
    typeof methodRaw !== "string" ||
    !(VALID_METHODS as readonly string[]).includes(methodRaw)
  ) {
    return NextResponse.json(
      {
        error: `method must be one of ${VALID_METHODS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const method = methodRaw as PayoutMethod;
  const destination =
    typeof patch.destination === "string"
      ? patch.destination.trim()
      : "";
  if (destination.length < 3 || destination.length > 32) {
    return NextResponse.json(
      { error: "destination must be 3-32 characters" },
      { status: 400 },
    );
  }
  const accountHolder =
    typeof patch.accountHolder === "string"
      ? patch.accountHolder.trim()
      : "";
  if (accountHolder.length < 2 || accountHolder.length > 80) {
    return NextResponse.json(
      { error: "accountHolder must be 2-80 characters" },
      { status: 400 },
    );
  }
  const isDefault = patch.isDefault === true;

  try {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true, _count: { select: { paymentAccounts: true } } },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Rider profile missing" },
        { status: 404 },
      );
    }

    // If this is the first account, force isDefault = true; otherwise
    // honour the caller. Demote every other account before promoting.
    const promote = isDefault || profile._count.paymentAccounts === 0;

    const account = await prisma.$transaction(async (tx) => {
      if (promote) {
        await tx.riderPaymentAccount.updateMany({
          where: { riderProfileId: profile.id },
          data: { isDefault: false },
        });
      }
      return tx.riderPaymentAccount.create({
        data: {
          riderProfileId: profile.id,
          label,
          method,
          destination,
          accountHolder,
          isDefault: promote,
        },
        select: {
          id: true,
          label: true,
          method: true,
          destination: true,
          accountHolder: true,
          isDefault: true,
        },
      });
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("riders/payment-details POST failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save payment account",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/riders/payment-details?id=<accountId>
 *
 * Update one saved payment account. Body fields are all optional;
 * at least one must be present. Promoting an account to default
 * demotes every other one for the rider.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Missing ?id=<accountId>" },
      { status: 400 },
    );
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
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "At least one field is required" },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    if (
      typeof patch.label !== "string" ||
      patch.label.trim().length < 1 ||
      patch.label.trim().length > 60
    ) {
      return NextResponse.json(
        { error: "label must be 1-60 characters" },
        { status: 400 },
      );
    }
    data.label = patch.label.trim();
  }
  if (patch.method !== undefined) {
    const VALID_METHODS: PayoutMethod[] = [
      "BKASH",
      "NAGAD",
      "ROCKET",
      "CARD",
    ];
    if (
      typeof patch.method !== "string" ||
      !(VALID_METHODS as readonly string[]).includes(patch.method)
    ) {
      return NextResponse.json(
        {
          error: `method must be one of ${VALID_METHODS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    data.method = patch.method;
  }
  if (patch.destination !== undefined) {
    if (
      typeof patch.destination !== "string" ||
      patch.destination.trim().length < 3 ||
      patch.destination.trim().length > 32
    ) {
      return NextResponse.json(
        { error: "destination must be 3-32 characters" },
        { status: 400 },
      );
    }
    data.destination = patch.destination.trim();
  }
  if (patch.accountHolder !== undefined) {
    if (
      typeof patch.accountHolder !== "string" ||
      patch.accountHolder.trim().length < 2 ||
      patch.accountHolder.trim().length > 80
    ) {
      return NextResponse.json(
        { error: "accountHolder must be 2-80 characters" },
        { status: 400 },
      );
    }
    data.accountHolder = patch.accountHolder.trim();
  }
  const promoteToDefault = patch.isDefault === true;

  try {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Rider profile missing" },
        { status: 404 },
      );
    }
    const existing = await prisma.riderPaymentAccount.findUnique({
      where: { id },
      select: { riderProfileId: true },
    });
    if (!existing || existing.riderProfileId !== profile.id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (promoteToDefault) {
        await tx.riderPaymentAccount.updateMany({
          where: { riderProfileId: profile.id },
          data: { isDefault: false },
        });
        data.isDefault = true;
      }
      return tx.riderPaymentAccount.update({
        where: { id },
        data,
        select: {
          id: true,
          label: true,
          method: true,
          destination: true,
          accountHolder: true,
          isDefault: true,
        },
      });
    });

    return NextResponse.json({ account: updated }, { status: 200 });
  } catch (err) {
    console.error("riders/payment-details PATCH failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update payment account",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/riders/payment-details?id=<accountId>
 *
 * Remove a saved payment account. If the removed account was the
 * default, the oldest remaining account is auto-promoted so the
 * rider always has a default for the next withdrawal.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Missing ?id=<accountId>" },
      { status: 400 },
    );
  }

  try {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Rider profile missing" },
        { status: 404 },
      );
    }
    const existing = await prisma.riderPaymentAccount.findUnique({
      where: { id },
      select: { riderProfileId: true, isDefault: true },
    });
    if (!existing || existing.riderProfileId !== profile.id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.riderPaymentAccount.delete({ where: { id } });
      if (existing.isDefault) {
        const replacement = await tx.riderPaymentAccount.findFirst({
          where: { riderProfileId: profile.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (replacement) {
          await tx.riderPaymentAccount.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("riders/payment-details DELETE failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to delete payment account",
      },
      { status: 500 },
    );
  }
}
