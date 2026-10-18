import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

/**
 * POST /api/auth/login
 *
 * Body (JSON):
 *   {
 *     email:         string,
 *     password:      string,
 *     expectedRole?: "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN"
 *   }
 *
 *   `expectedRole` is sent by the per-portal login forms
 *   (/partner/login, /rider/login, /admin/login). When present, the
 *   server refuses to issue a JWT unless the account's stored role
 *   matches — this is the security fix from কাজ ২ of the carousel
 *   task: previously the customer-facing login endpoint would
 *   happily hand out a CUSTOMER JWT to anyone whose email + password
 *   matched, regardless of their actual role.
 *
 *   When `expectedRole` is omitted (the customer /login page), only
 *   CUSTOMER accounts are accepted; ADMIN/PARTNER/RIDER are rejected
 *   with the same generic 401 so we don't leak which one is wrong.
 *
 * Responses:
 *   200  { user: { id, name, email, phone, role, createdAt }, token }
 *   400  { error: "<validation message>" }
 *   401  { error: "Invalid email or password" }   (also for unknown
 *         email — same message to avoid leaking which one is wrong;
 *         also returned for role-mismatch + isSuspended so the only
 *         way for an attacker to detect a wrong-role attempt is to
 *         see the form's banner, which is gated by a valid
 *         email+password first)
 *   403  { error: "This account is registered as <ROLE>. Use the
 *                matching login page." }  (returned ONLY when the
 *                caller explicitly passed `expectedRole` and the
 *                account exists, so the portal-specific form can
 *                surface an actionable message)
 *   500  { error: "<server message>" }
 */

const VALID_ROLES: ReadonlyArray<UserRole> = [
  "CUSTOMER",
  "PARTNER",
  "RIDER",
  "ADMIN",
];

function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (VALID_ROLES as readonly string[]).includes(value)
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }

  const { email, password, expectedRole } = body as Record<string, unknown>;

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "email must be a valid address" },
      { status: 400 },
    );
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json(
      { error: "password is required" },
      { status: 400 },
    );
  }

  // The customer-facing /login form omits expectedRole; if a future
  // caller (or a tampered request) sends an unexpected value we
  // refuse rather than silently ignoring it.
  let roleGate: UserRole | null = null;
  if (expectedRole !== undefined && expectedRole !== null) {
    if (!isUserRole(expectedRole)) {
      return NextResponse.json(
        {
          error:
            "expectedRole must be one of " + VALID_ROLES.join(", "),
        },
        { status: 400 },
      );
    }
    roleGate = expectedRole;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Always run bcrypt.compare, even when the user doesn't exist.
  // This keeps the response time roughly constant and avoids the
  // "user-enumeration via timing" leak.
  const fakeHash =
    "$2b$12$CwTycUXWue0Thq9StjUM0uJ8s6fXzNjh0DtZ7tQ3w0OKbjE8MY0Vu"; // bcrypt-hashed "decoy"
  const ok = user
    ? await bcrypt.compare(password, user.password)
    : await bcrypt.compare(password, fakeHash);

  if (!user || !ok) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Admin-driven "ban" gate. When an admin flips a user's
  // `isSuspended` flag on, we refuse logins here regardless of
  // password correctness. Same generic "Invalid email or password"
  // copy as the failure path above so we don't leak whether the
  // account exists or was banned.
  if (user.isSuspended) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // Role gate (কাজ ২ — security fix).
  //   • If the caller passed `expectedRole` (a per-portal form did),
  //     the account's role MUST match it; otherwise reject with an
  //     actionable message naming the actual role so the form can
  //     show "This account is registered as PARTNER…".
  //   • If no `expectedRole` was passed (the customer /login page),
  //     we still enforce CUSTOMER-only — a stray tampered request
  //     can't turn the customer login endpoint into a back door for
  //     ADMIN/PARTNER/RIDER tokens.
  if (roleGate !== null && user.role !== roleGate) {
    return NextResponse.json(
      {
        error: `This account is registered as ${user.role}. Use the matching login page.`,
      },
      { status: 403 },
    );
  }
  if (roleGate === null && user.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const token = signToken({ sub: user.id, role: user.role });

  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    },
    { status: 200 },
  );
}
