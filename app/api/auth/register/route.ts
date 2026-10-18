import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { verifyAndConsumeOtp } from "@/lib/otp-verify";
import {
  generateUniqueReferralCode,
  isValidReferralCodeShape,
  normaliseReferralCode,
} from "@/lib/referral";

/**
 * POST /api/auth/register
 *
 * Body (JSON):
 *   {
 *     name:        string,           // 2-80 chars
 *     email:       string,           // must be valid + free
 *     password:    string,           // 8+ chars
 *     phone?:      string,
 *   }
 *
 * This is the CUSTOMER-facing signup endpoint. Per the কাজ ২
 * security fix the backend ALWAYS creates a CUSTOMER — any `role`
 * the client tries to send is silently ignored (override) so a
 * tampered request can't escalate the new account to PARTNER,
 * RIDER, or ADMIN. Partner and rider onboarding live on dedicated
 * sub-routes (`/api/auth/register/partner` and
 * `/api/auth/register/rider`).
 *
 * Responses:
 *   201  { user: { id, name, email, phone, role, createdAt }, token }
 *   400  { error: "<validation message>" }
 *   409  { error: "Email already registered" }
 *   500  { error: "<server message>" }
 */

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

  const { name, email, password, phone, otp, referralCode } = body as Record<
    string,
    unknown
  >;

  // ---- validation ----------------------------------------------------
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "name must be 2-80 characters" },
      { status: 400 },
    );
  }

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "email must be a valid address" },
      { status: 400 },
    );
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 },
    );
  }

  // Feat 6 — optional referral code. Trim + upper-case, validate
  // shape, then look up the referrer OUTSIDE the user-create
  // transaction so a missing/invalid code can short-circuit with
  // a 400 before we mint a User row. We still record the
  // resolved referrer id on the new user INSIDE the transaction
  // (so a race between this lookup and a hard-delete of the
  // referrer can't leave us with a dangling `referredByUserId`).
  let cleanedReferralCode: string | null = null;
  let referrerUserId: string | null = null;
  if (referralCode !== undefined && referralCode !== null && referralCode !== "") {
    if (typeof referralCode !== "string") {
      return NextResponse.json(
        { error: "referralCode must be a string" },
        { status: 400 },
      );
    }
    const cleaned = normaliseReferralCode(referralCode);
    if (!isValidReferralCodeShape(cleaned)) {
      return NextResponse.json(
        { error: "Invalid referral code format" },
        { status: 400 },
      );
    }
    const referrer = await prisma.user.findUnique({
      where: { referralCode: cleaned },
      select: { id: true, role: true, deletedAt: true, isSuspended: true },
    });
    if (
      !referrer ||
      referrer.deletedAt !== null ||
      referrer.isSuspended
    ) {
      return NextResponse.json(
        { error: "Referral code not found" },
        { status: 400 },
      );
    }
    // Only CUSTOMER accounts can be referrers. A partner or
    // rider who somehow ends up with a code is a bug; refuse
    // rather than silently give out bonus wallet money.
    if (referrer.role !== "CUSTOMER") {
      return NextResponse.json(
        { error: "Referral code is not eligible" },
        { status: 400 },
      );
    }
    cleanedReferralCode = cleaned;
    referrerUserId = referrer.id;
  }

  // কাজ ২ security fix: this endpoint ALWAYS creates a CUSTOMER,
  // regardless of any `role` field a tampered client might send.
  // The role enum is still imported below for the CustomerProfile
  // create (which keys off the role literal) — we just hard-code
  // the value here so there's no path to override it.
  const userRole: UserRole = "CUSTOMER";

  let normalizedPhone: string | null = null;
  if (phone !== undefined && phone !== null) {
    if (typeof phone !== "string" || phone.length > 32) {
      return NextResponse.json(
        { error: "phone must be a string up to 32 chars" },
        { status: 400 },
      );
    }
    normalizedPhone = phone.trim() || null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // ---- OTP verification (ধাপ ২) -------------------------------------
  // Must come before uniqueness check so an attacker can't learn
  // whether an email is registered by observing the OTP path's
  // behaviour. The verify helper also doubles as the gatekeeper
  // that prevents stale / replayed codes from being used.
  if (typeof otp !== "string") {
    return NextResponse.json(
      { error: "Verification code is required" },
      { status: 400 },
    );
  }
  const otpResult = await verifyAndConsumeOtp(
    normalizedEmail,
    otp,
    "REGISTRATION",
  );
  if (!otpResult.ok) {
    return NextResponse.json(
      { error: otpResult.error },
      { status: otpResult.status },
    );
  }

  // ---- uniqueness check ---------------------------------------------
  // ধাপ ৩ — check both email + phone for collisions so the user
  // gets a clear 409 with the offending field. The unique constraint
  // on the column will catch the race-condition path; this is the
  // friendlier "you tried to register twice" path.
  const [existingEmail, existingPhone] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail } }),
    normalizedPhone
      ? prisma.user.findUnique({ where: { phone: normalizedPhone } })
      : Promise.resolve(null),
  ]);
  if (existingEmail) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }
  if (existingPhone) {
    return NextResponse.json(
      { error: "An account with this phone number already exists" },
      { status: 409 },
    );
  }

  // ---- hash + insert -------------------------------------------------
  // 12 rounds keeps registration around ~150ms on a single CPU.
  const passwordHash = await bcrypt.hash(password, 12);

  // CUSTOMER-only create. We create the User row AND the matching
  // CustomerProfile row in one transaction so we never have a
  // half-created account that would later confuse the role-specific
  // routes.
  let created: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN";
    createdAt: Date;
  } | null = null;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Feat 6 — generate a fresh referralCode for the new
      // user INSIDE the transaction so the unique-index check
      // and the user.create happen in the same atomic step.
      // If a referrer was provided, set referredByUserId here
      // and create a Referral(PENDING) row right after the
      // user.create so the link is durable from day one.
      const newReferralCode = await generateUniqueReferralCode(tx);
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          password: passwordHash,
          phone: normalizedPhone,
          role: userRole,
          referralCode: newReferralCode,
          ...(referrerUserId ? { referredByUserId: referrerUserId } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      // Feat 6 — open the referral edge in PENDING. The
      // (refereeUserId) is unique so even if the customer
      // somehow re-registered later with a different code,
      // only their first referrer would ever lock in.
      if (referrerUserId) {
        try {
          await tx.referral.create({
            data: {
              referrerUserId,
              refereeUserId: user.id,
              status: "PENDING",
            },
          });
        } catch (e) {
          // race: same refereeUserId already has a referral
          // row from a parallel register. That's a hard 409
          // — the user should not be silently demoted to "no
          // referrer". Surface a clean error so the client
          // can ask the user to retry without the code.
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            throw new Error("REFERRAL_ALREADY_LINKED");
          }
          throw e;
        }
      }
      await tx.customerProfile.create({ data: { userId: user.id } });
      return user;
    });
  } catch (err) {
    // Feat 6 — referral-race sentinel: a parallel registration
    // could land a Referral row for the same refereeUserId
    // before ours. Translate to a clean 400.
    if (err instanceof Error && err.message === "REFERRAL_ALREADY_LINKED") {
      return NextResponse.json(
        {
          error:
            "This account is already linked to a referral. Remove the code and try again.",
        },
        { status: 400 },
      );
    }
    // Race-condition path — the email/phone uniqueness pre-check
    // above happens between `findUnique` and `user.create`. If
    // another registration slips in, Prisma raises P2002. Translate
    // that to the same 409 with a useful error message.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const target = (err as { meta?: { target?: string[] } }).meta?.target;
      const field = Array.isArray(target) && target.length > 0 ? target[0] : null;
      const message =
        field === "phone"
          ? "An account with this phone number already exists"
          : "An account with this email already exists";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    throw err;
  }
  if (!created) {
    // Defensive — should be unreachable because the only early
    // returns above are inside the try-block.
    return NextResponse.json(
      { error: "Could not create account" },
      { status: 500 },
    );
  }

  const token = signToken({ sub: created.id, role: created.role });

  return NextResponse.json(
    { user: created, token },
    { status: 201 },
  );
}
