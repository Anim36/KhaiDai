import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RiderDocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { verifyAndConsumeOtp } from "@/lib/otp-verify";

/**
 * POST /api/auth/register/rider
 *
 * The rider-onboarding counterpart of `/api/auth/register`. Same
 * shape as the customer signup, but the role is hard-coded to
 * RIDER. Also creates a `RiderProfile` (with optional
 * vehicleType/vehicleRegNumber) so the new account is immediately
 * usable by `/api/rider/*` routes.
 *
 * Body (JSON):
 *   {
 *     name:             string,           // 2-80 chars
 *     email:            string,           // must be valid + free
 *     password:         string,           // 8+ chars
 *     phone?:           string,
 *     vehicleType?:     "bike" | "bicycle" | "car",
 *     vehicleRegNumber?: string,
 *     otp:              string,           // ধাপ ২ — 6-digit verification
 *     zone?: {                              // Bug 5 fix — optional
 *       lat:       number,                  // service zone picked in
 *       lng:       number,                  // the registration form.
 *       address?:  string,                  // Server writes to
 *       radiusKm?: number,                  // RiderProfile.zone* in
 *     },                                    // the same transaction.
 *     documents?: Array<{                   // Bug 2 — optional, but
 *       documentType: "NID" |               //   strongly encouraged:
 *         "DRIVING_LICENSE" |               //   the admin verification
 *         "VEHICLE_REGISTRATION" |          //   queue is empty without
 *         "OTHER",                          //   at least the NID, so
 *       fileName:    string,                //   pending reviews get
 *       fileUrl:     string,                //   stuck forever.
 *       mime:        string,
 *       size:        number,
 *     }>,
 *   }
 *
 * Responses:
 *   201  { user: { id, name, email, phone, role, createdAt }, token }
 *   400  { error: "<validation message>" }
 *   409  { error: "Email already registered" }
 *   500  { error: "<server message>" }
 */

const VALID_VEHICLE_TYPES: ReadonlyArray<string> = ["bike", "bicycle", "car"];

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

  const {
    name,
    email,
    password,
    phone,
    vehicleType,
    vehicleRegNumber,
    otp,
    zone,
    documents,
  } = body as Record<string, unknown>;

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

  // ধাপ ৩ — check both email + phone for collisions so the user
  // gets a clear 409 with the offending field.
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

  const passwordHash = await bcrypt.hash(password, 12);

  // Optional vehicle fields. Invalid values fall back to null rather
  // than failing the registration — the alternative would lock the
  // rider out if a future client sent a typo.
  const normalizedVehicleType =
    typeof vehicleType === "string" &&
    VALID_VEHICLE_TYPES.includes(vehicleType)
      ? vehicleType
      : null;
  const normalizedVehicleReg =
    typeof vehicleRegNumber === "string" && vehicleRegNumber.trim().length > 0
      ? vehicleRegNumber.trim().slice(0, 64)
      : null;

  // Bug 5 fix — optional service zone picked during the
  // registration form. We re-run the same lat/lng validation
  // used by /api/riders/zone (sanity bounds) so a tampered
  // client can't slip in a bogus pair. The radius is
  // intentionally clamped to 5 km server-side to match the
  // existing zone endpoint — clients cannot sneak in a larger
  // radius. When no zone was picked, this stays `null` and the
  // RiderProfile is created with empty zone fields, exactly as
  // it did before this fix.
  const ZONE_RADIUS_KM = 5;
  let normalizedZone: {
    lat: number;
    lng: number;
    address: string;
    radiusKm: number;
  } | null = null;
  if (zone !== undefined && zone !== null) {
    if (
      !zone ||
      typeof zone !== "object" ||
      typeof (zone as Record<string, unknown>).lat !== "number" ||
      typeof (zone as Record<string, unknown>).lng !== "number"
    ) {
      return NextResponse.json(
        { error: "zone.lat and zone.lng must be numbers" },
        { status: 400 },
      );
    }
    const z = zone as Record<string, unknown>;
    const lat = z.lat as number;
    const lng = z.lng as number;
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json(
        { error: "zone lat/lng out of range" },
        { status: 400 },
      );
    }
    const address =
      typeof z.address === "string" && z.address.trim().length > 0
        ? z.address.trim().slice(0, 240)
        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    normalizedZone = {
      lat,
      lng,
      address,
      radiusKm: ZONE_RADIUS_KM,
    };
  }

  // ---- Optional documents payload (Bug 2) -----------------------------
  // The form sends the uploaded license / NID here as base64 data
  // URLs. We persist one RiderDocument row per entry in the same
  // transaction as the RiderProfile so the admin verification queue
  // can render an inline preview the moment the signup completes.
  type RiderDocRow = {
    documentType: RiderDocumentType;
    fileName: string;
    fileUrl: string;
    mime: string;
    size: number;
  };
  let normalizedDocuments: RiderDocRow[] | null = null;
  if (documents !== undefined && documents !== null) {
    if (!Array.isArray(documents)) {
      return NextResponse.json(
        { error: "documents must be an array" },
        { status: 400 },
      );
    }
    const VALID: RiderDocumentType[] = [
      "NID",
      "DRIVING_LICENSE",
      "VEHICLE_REGISTRATION",
      "OTHER",
    ];
    const out: RiderDocRow[] = [];
    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      if (!d || typeof d !== "object") {
        return NextResponse.json(
          { error: `documents[${i}] must be an object` },
          { status: 400 },
        );
      }
      const r = d as Record<string, unknown>;
      const documentType = r.documentType;
      const fileName = r.fileName;
      const fileUrl = r.fileUrl;
      const mime = r.mime;
      const size = r.size;
      if (typeof documentType !== "string" || !VALID.includes(documentType as RiderDocumentType)) {
        return NextResponse.json(
          {
            error: `documents[${i}].documentType must be one of ${VALID.join(" | ")}`,
          },
          { status: 400 },
        );
      }
      if (typeof fileUrl !== "string" || fileUrl.length === 0) {
        return NextResponse.json(
          { error: `documents[${i}].fileUrl is required` },
          { status: 400 },
        );
      }
      if (fileUrl.length > 8 * 1024 * 1024) {
        // 8MB hard limit for the base64 payload — keeps the JSON
        // request below ~10MB and avoids hammering the server with
        // huge image files. The client-side FileReader also caps at
        // ~5MB; this is a belt-and-braces second guard.
        return NextResponse.json(
          { error: `documents[${i}].fileUrl exceeds 8MB limit` },
          { status: 413 },
        );
      }
      out.push({
        documentType: documentType as RiderDocumentType,
        fileName: typeof fileName === "string" ? fileName.slice(0, 200) : "",
        fileUrl,
        mime: typeof mime === "string" ? mime.slice(0, 80) : "application/octet-stream",
        size: typeof size === "number" && Number.isFinite(size) ? size : 0,
      });
    }
    normalizedDocuments = out;
  }

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
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          password: passwordHash,
          phone: normalizedPhone,
          role: "RIDER",
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
      const riderProfile = await tx.riderProfile.create({
        data: {
          userId: user.id,
          vehicleType: normalizedVehicleType,
          vehicleRegNumber: normalizedVehicleReg,
          // Bug 5 fix — persist the service zone picked during
          // registration in the same transaction. When the
          // client didn't send a zone we leave the fields null
          // (the rider dashboard's blocking modal still works
          // the same as before for unzoned riders).
          ...(normalizedZone
            ? {
                zoneLat: normalizedZone.lat,
                zoneLng: normalizedZone.lng,
                zoneRadiusKm: normalizedZone.radiusKm,
                zoneAddress: normalizedZone.address,
              }
            : {}),
        },
        select: { id: true },
      });

      // Bug 2 — write any uploaded documents in the same
      // transaction so the admin verification queue sees them the
      // moment the signup completes. Skip silently when none were
      // sent (e.g. an admin invited a rider without going through
      // the onboarding form).
      if (normalizedDocuments) {
        for (const d of normalizedDocuments) {
          await tx.riderDocument.create({
            data: {
              riderProfileId: riderProfile.id,
              documentType: d.documentType,
              fileUrl: d.fileUrl,
            },
          });
        }
      }
      return user;
    });
  } catch (err) {
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
    return NextResponse.json(
      { error: "Could not create account" },
      { status: 500 },
    );
  }

  const token = signToken({ sub: created.id, role: created.role });

  return NextResponse.json({ user: created, token }, { status: 201 });
}
