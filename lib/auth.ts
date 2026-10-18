import "dotenv/config";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * lib/auth.ts — JWT helpers + protected-route guard.
 *
 * Token shape:
 *   { sub: userId, role: UserRole }
 *
 *   • `sub` is the Prisma User.id (cuid).
 *   • `role` lets route guards decide CUSTOMER vs PARTNER vs RIDER
 *     without an extra DB round-trip.
 *
 * The secret is read from JWT_SECRET at import time. We throw on
 * startup if it's missing so we never accidentally ship unsigned
 * tokens.
 */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Add it to .env before starting the server.",
  );
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

export type JwtPayload = {
  sub: string;
  role: UserRole;
};

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

/* -------------------------------------------------------------------------- */
/*  signToken                                                                 */
/* -------------------------------------------------------------------------- */

export function signToken(payload: JwtPayload): string {
  // jsonwebtoken's expiresIn accepts string shorthand like "7d",
  // which is exactly what we set in .env.
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/* -------------------------------------------------------------------------- */
/*  verifyToken                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Low-level: returns the decoded payload or null. Throws nothing —
 * a bad token is just "no user".
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string);
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.sub === "string" &&
      typeof (decoded as Record<string, unknown>).role === "string"
    ) {
      return { sub: decoded.sub, role: (decoded as JwtPayload).role };
    }
    return null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  readBearerToken                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Extract a bearer token from a NextRequest's Authorization
 * header. Returns null when missing/malformed.
 */
export function readBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/* -------------------------------------------------------------------------- */
/*  verifyAuth  — for protected routes                                        */
/* -------------------------------------------------------------------------- */

export type VerifyAuthResult =
  | { ok: true; user: AuthedUser; token: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Identifies the request's bearer and looks up the full User
 * row. Returns `{ ok: true, user }` for valid tokens, or
 * `{ ok: false, status, error }` for everything else. Protected
 * route handlers should propagate `status` and `error` as a JSON
 * response.
 *
 * Usage in a route handler:
 *
 *   const auth = await verifyAuth(req);
 *   if (!auth.ok) {
 *     return Response.json({ error: auth.error }, { status: auth.status });
 *   }
 *   // auth.user is guaranteed non-null here
 */
export async function verifyAuth(
  req: NextRequest,
): Promise<VerifyAuthResult> {
  const token = readBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  const payload = verifyToken(token);
  if (!payload) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    return { ok: false, status: 401, error: "User no longer exists" };
  }
  return {
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  requireRole  — convenience for role-gated routes                          */
/* -------------------------------------------------------------------------- */

export async function requireRole(
  req: NextRequest,
  ...allowed: UserRole[]
): Promise<VerifyAuthResult> {
  const result = await verifyAuth(req);
  if (!result.ok) return result;
  if (!allowed.includes(result.user.role)) {
    return {
      ok: false,
      status: 403,
      error: `Forbidden: requires one of ${allowed.join(", ")}`,
    };
  }
  return result;
}
