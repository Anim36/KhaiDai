import { NextRequest, NextResponse } from "next/server";
import type { PayoutMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/**
 * Partner payment-account CRUD, hung off /api/partner/payment-accounts.
 *
 * The partner adds bKash / Nagad / Rocket / Card accounts in their
 * Settings page. The Earnings "Request Payout" form picks one of
 * these saved rows (no more typing the destination at payout time).
 *
 * Same shape as the rider equivalent so the Settings UI can be
 * shared — see /api/riders/payment-details for the parallel
 * implementation.
 */

const VALID_METHODS: PayoutMethod[] = ["BKASH", "NAGAD", "ROCKET", "CARD"];

/**
 * GET /api/partner/payment-accounts
 *
 *   200 { accounts: Array<{ id, label, method, destination,
 *                            accountHolder, isDefault, restaurantId }> }
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId: auth.user.id },
      select: {
        id: true,
        restaurants: { select: { id: true }, take: 1 },
        paymentAccounts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            method: true,
            destination: true,
            accountHolder: true,
            isDefault: true,
            restaurantId: true,
          },
        },
      },
    });
    return NextResponse.json(
      {
        accounts: profile?.paymentAccounts ?? [],
        restaurantId: profile?.restaurants[0]?.id ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("partner/payment-accounts GET failed", err);
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
 * POST /api/partner/payment-accounts
 *
 * Body: { label, method, destination, accountHolder, isDefault? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
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
    typeof patch.destination === "string" ? patch.destination.trim() : "";
  if (destination.length < 3 || destination.length > 32) {
    return NextResponse.json(
      { error: "destination must be 3-32 characters" },
      { status: 400 },
    );
  }
  const accountHolder =
    typeof patch.accountHolder === "string" ? patch.accountHolder.trim() : "";
  if (accountHolder.length < 2 || accountHolder.length > 80) {
    return NextResponse.json(
      { error: "accountHolder must be 2-80 characters" },
      { status: 400 },
    );
  }
  const isDefault = patch.isDefault === true;

  try {
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId: auth.user.id },
      select: {
        id: true,
        restaurants: { select: { id: true }, take: 1 },
        _count: { select: { paymentAccounts: true } },
      },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Partner profile missing" },
        { status: 404 },
      );
    }
    const restaurantId = profile.restaurants[0]?.id ?? null;
    const promote = isDefault || profile._count.paymentAccounts === 0;

    const account = await prisma.$transaction(async (tx) => {
      if (promote) {
        await tx.partnerPaymentAccount.updateMany({
          where: { partnerProfileId: profile.id },
          data: { isDefault: false },
        });
      }
      return tx.partnerPaymentAccount.create({
        data: {
          partnerProfileId: profile.id,
          restaurantId,
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
          restaurantId: true,
        },
      });
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("partner/payment-accounts POST failed", err);
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
 * PATCH /api/partner/payment-accounts?id=<accountId>
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
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
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Partner profile missing" },
        { status: 404 },
      );
    }
    const existing = await prisma.partnerPaymentAccount.findUnique({
      where: { id },
      select: { partnerProfileId: true },
    });
    if (!existing || existing.partnerProfileId !== profile.id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (promoteToDefault) {
        await tx.partnerPaymentAccount.updateMany({
          where: { partnerProfileId: profile.id },
          data: { isDefault: false },
        });
        data.isDefault = true;
      }
      return tx.partnerPaymentAccount.update({
        where: { id },
        data,
        select: {
          id: true,
          label: true,
          method: true,
          destination: true,
          accountHolder: true,
          isDefault: true,
          restaurantId: true,
        },
      });
    });
    return NextResponse.json({ account: updated }, { status: 200 });
  } catch (err) {
    console.error("partner/payment-accounts PATCH failed", err);
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
 * DELETE /api/partner/payment-accounts?id=<accountId>
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, "PARTNER");
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
    const profile = await prisma.partnerProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Partner profile missing" },
        { status: 404 },
      );
    }
    const existing = await prisma.partnerPaymentAccount.findUnique({
      where: { id },
      select: { partnerProfileId: true, isDefault: true },
    });
    if (!existing || existing.partnerProfileId !== profile.id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.partnerPaymentAccount.delete({ where: { id } });
      if (existing.isDefault) {
        const replacement = await tx.partnerPaymentAccount.findFirst({
          where: { partnerProfileId: profile.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (replacement) {
          await tx.partnerPaymentAccount.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("partner/payment-accounts DELETE failed", err);
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
