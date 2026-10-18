import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

/**
 * /api/users/me
 *
 *   GET  — return the signed-in user's public-facing profile
 *          (everything except the password). Mirrors the auth
 *          response shape so the profile page can call a single
 *          endpoint instead of re-using /api/auth/login.
 *
 *   PATCH — update the signed-in user's editable fields. Body
 *          accepts any subset of:
 *              name, phone,
 *              notifyOrderUpdates, notifyPromotions, notifyNewsletter.
 *          `email` is intentionally NOT editable here (changing
 *          the identity would require re-verification).
 *
 * Auth: any role. The verifyAuth helper guarantees a real signed-in
 * user before either handler runs.
 *
 * Note: the legacy `notificationsEnabled` flag was split into three
 * independent booleans so the Settings panel can flip them one at a
 * time without affecting the others. We accept (and ignore) the old
 * key for one release so older clients don't blow up.
 */

type PatchBody = {
  name?: unknown;
  phone?: unknown;
  notifyOrderUpdates?: unknown;
  notifyPromotions?: unknown;
  notifyNewsletter?: unknown;
  notificationsEnabled?: unknown;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeOptionalStr(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v === "string") return v.trim();
  return undefined;
}

function safeBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

type UserShape = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  // Nullable — the notify* flags only carry meaningful values for
  // CUSTOMER users. PARTNER / RIDER rows leave them null.
  notifyOrderUpdates: boolean | null;
  notifyPromotions: boolean | null;
  notifyNewsletter: boolean | null;
};

function shape(u: UserShape) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    notifyOrderUpdates: u.notifyOrderUpdates,
    notifyPromotions: u.notifyPromotions,
    notifyNewsletter: u.notifyNewsletter,
  };
}

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  notifyOrderUpdates: true,
  notifyPromotions: true,
  notifyNewsletter: true,
} as const;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const u = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: PUBLIC_SELECT,
    });
    if (!u) {
      return NextResponse.json(
        { error: "User no longer exists" },
        { status: 401 },
      );
    }
    return NextResponse.json({ user: shape(u) }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load profile" },
      { status: 500 },
    );
  }
}

type ProfileUpdate = {
  name?: string;
  phone?: string | null;
  notifyOrderUpdates?: boolean;
  notifyPromotions?: boolean;
  notifyNewsletter?: boolean;
};

export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: ProfileUpdate = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = safeStr(body.name);
    if (!name) {
      return NextResponse.json(
        { error: "Name cannot be empty." },
        { status: 400 },
      );
    }
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Name is too short." },
        { status: 400 },
      );
    }
    update.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const phone = safeOptionalStr(body.phone);
    if (phone !== undefined) {
      // Empty string → store null (clears the field).
      if (
        phone !== null &&
        phone !== "" &&
        !/^[+\d][\d\s-]{6,}$/.test(phone)
      ) {
        return NextResponse.json(
          { error: "Enter a valid phone number." },
          { status: 400 },
        );
      }
      update.phone = phone === "" ? null : phone;
    }
  }

  // Each notification flag is independent — flipping one in the
  // request body leaves the other two untouched (they're not part
  // of the PATCH payload at all, so Prisma won't touch them).
  for (const key of [
    "notifyOrderUpdates",
    "notifyPromotions",
    "notifyNewsletter",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const v = safeBool(body[key]);
      if (v === undefined) {
        return NextResponse.json(
          { error: `${key} must be a boolean.` },
          { status: 400 },
        );
      }
      update[key] = v;
    }
  }

  // `notificationsEnabled` was the legacy single boolean. We
  // silently ignore it now — clients still sending it (older
  // builds) won't break, they just won't see any state change.
  // Drop it from `update` if present.
  void body.notificationsEnabled;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No editable fields provided." },
      { status: 400 },
    );
  }

  try {
    const u = await prisma.user.update({
      where: { id: auth.user.id },
      data: update,
      select: PUBLIC_SELECT,
    });
    return NextResponse.json({ user: shape(u) }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update profile",
      },
      { status: 500 },
    );
  }
}
