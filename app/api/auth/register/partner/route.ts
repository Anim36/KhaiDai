import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { verifyAndConsumeOtp } from "@/lib/otp-verify";

/**
 * POST /api/auth/register/partner
 *
 * The partner-onboarding counterpart of `/api/auth/register`. The
 * role is hard-coded to PARTNER so a tampered client can't
 * escalate a request that started here. Also creates a
 * `PartnerProfile` so the new account is immediately usable by
 * `/api/partner/*` routes.
 *
 * Bug 2 fix: also accepts the partner's first restaurant profile
 * and their verification documents in the SAME request, so the
 * admin verification queue sees the row + the documents the moment
 * the signup completes (previously documents were silently
 * dropped — only the user row was created, no Restaurant row, and
 * no RestaurantDocument rows).
 *
 * Body (JSON):
 *   {
 *     name:       string,           // 2-80 chars
 *     email:      string,           // must be valid + free
 *     password:   string,           // 8+ chars
 *     phone?:     string,
 *     otp:        string,           // 6-digit verification code
 *     restaurant?: {
 *       name:     string,           // 2-80 chars
 *       address:  string,           // 4-200 chars
 *       cuisine:  string,           // enum-backed string
 *     },
 *     documents?: Array<{
 *       documentType: "TRADE_LICENSE" | "OWNER_NID" | "FOOD_SAFETY_CERT" | "OTHER",
 *       fileName:    string,
 *       fileUrl:     string,        // base64 data URL
 *       mime:        string,
 *       size:        number,
 *     }>,
 *   }
 *
 * Responses:
 *   201  { user, restaurantId, token }
 *   400  { error: "<validation message>" }
 *   409  { error: "An account with this email/phone already exists" }
 *   500  { error: "<server message>" }
 */

const VALID_CUISINES = new Set([
  "bangladeshi",
  "indian",
  "chinese",
  "burgers",
  "desserts",
  "healthy",
  "other",
]);
const VALID_DOC_TYPES = new Set([
  "TRADE_LICENSE",
  "OWNER_NID",
  "FOOD_SAFETY_CERT",
  "OTHER",
] as const);
type DocType = "TRADE_LICENSE" | "OWNER_NID" | "FOOD_SAFETY_CERT" | "OTHER";
const MAX_DATA_URL_CHARS = 10 * 1024 * 1024; // 10 MB string budget.

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
    otp,
    restaurant,
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

  // ---- Optional restaurant payload (Bug 2) --------------------------
  // The form sends this when the partner filled in their business
  // details + uploaded documents BEFORE hitting the verify-email
  // step. We don't make it required — partners who sign up via a
  // shorter flow can still finalise the restaurant later from the
  // partner dashboard's onboarding wizard.
  //
  // Bug fix — `latitude` / `longitude` are accepted (and persisted
  // on the Restaurant row) when the partner dropped a pin on the
  // registration form's AddressPicker. Without these the new
  // restaurant is invisible to delivery-distance filtering (the
  // customer listing filters by haversine distance from the
  // restaurant pin to the customer's drop-off). The picker's
  // validation already requires a real lat/lng pair, but we
  // re-validate here as a belt-and-braces second guard against a
  // tampered client.
  let normalizedRestaurant:
    | {
        name: string;
        address: string;
        cuisine: string;
        latitude: number | null;
        longitude: number | null;
      }
    | null = null;
  if (restaurant !== undefined && restaurant !== null) {
    if (
      !restaurant ||
      typeof restaurant !== "object" ||
      typeof (restaurant as Record<string, unknown>).name !== "string" ||
      typeof (restaurant as Record<string, unknown>).address !== "string" ||
      typeof (restaurant as Record<string, unknown>).cuisine !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "restaurant must include name, address, and cuisine (all strings)",
        },
        { status: 400 },
      );
    }
    const r = restaurant as Record<string, unknown>;
    const rName = (r.name as string).trim();
    const rAddress = (r.address as string).trim();
    const rCuisine = (r.cuisine as string).trim();
    if (rName.length < 2 || rName.length > 80) {
      return NextResponse.json(
        { error: "restaurant.name must be 2-80 characters" },
        { status: 400 },
      );
    }
    if (rAddress.length < 4 || rAddress.length > 200) {
      return NextResponse.json(
        { error: "restaurant.address must be 4-200 characters" },
        { status: 400 },
      );
    }
    if (!VALID_CUISINES.has(rCuisine)) {
      return NextResponse.json(
        { error: "restaurant.cuisine is not a supported value" },
        { status: 400 },
      );
    }
    // Lat/lng are optional — when omitted we save nulls so the
    // restaurant row is still created (the partner can pin from
    // the dashboard later). When provided, both must be present
    // and inside their valid ranges, otherwise we 400 instead of
    // silently dropping half the pair.
    const rawLat = r.latitude;
    const rawLng = r.longitude;
    let normalizedLat: number | null = null;
    let normalizedLng: number | null = null;
    const hasLat = rawLat !== undefined && rawLat !== null;
    const hasLng = rawLng !== undefined && rawLng !== null;
    if (hasLat !== hasLng) {
      return NextResponse.json(
        {
          error:
            "restaurant.latitude and restaurant.longitude must be provided together",
        },
        { status: 400 },
      );
    }
    if (hasLat && hasLng) {
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return NextResponse.json(
          { error: "restaurant.latitude/longitude are out of range" },
          { status: 400 },
        );
      }
      normalizedLat = lat;
      normalizedLng = lng;
    }
    normalizedRestaurant = {
      name: rName,
      address: rAddress,
      cuisine: rCuisine,
      latitude: normalizedLat,
      longitude: normalizedLng,
    };
  }

  // ---- Optional documents payload (Bug 2) ---------------------------
  // Same — only valid when a restaurant was created in the same
  // request, so the FK has somewhere to point.
  type DocumentRow = {
    documentType: DocType;
    fileName: string;
    fileUrl: string;
    mime: string;
    size: number;
  };
  let normalizedDocuments: DocumentRow[] | null = null;
  if (documents !== undefined && documents !== null) {
    if (!Array.isArray(documents)) {
      return NextResponse.json(
        { error: "documents must be an array" },
        { status: 400 },
      );
    }
    const out: DocumentRow[] = [];
    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      if (!d || typeof d !== "object") {
        return NextResponse.json(
          { error: `documents[${i}] must be an object` },
          { status: 400 },
        );
      }
      const obj = d as Record<string, unknown>;
      if (typeof obj.documentType !== "string" || !VALID_DOC_TYPES.has(obj.documentType as DocType)) {
        return NextResponse.json(
          { error: `documents[${i}].documentType is invalid` },
          { status: 400 },
        );
      }
      if (typeof obj.fileUrl !== "string" || !obj.fileUrl.startsWith("data:")) {
        return NextResponse.json(
          { error: `documents[${i}].fileUrl must be a data URL` },
          { status: 400 },
        );
      }
      if (obj.fileUrl.length > MAX_DATA_URL_CHARS) {
        return NextResponse.json(
          { error: `documents[${i}].fileUrl exceeds 10 MB` },
          { status: 400 },
        );
      }
      if (typeof obj.fileName !== "string" || obj.fileName.length > 200) {
        return NextResponse.json(
          { error: `documents[${i}].fileName is required` },
          { status: 400 },
        );
      }
      out.push({
        documentType: obj.documentType as DocType,
        fileName: obj.fileName,
        fileUrl: obj.fileUrl,
        mime: typeof obj.mime === "string" ? obj.mime : "application/octet-stream",
        size: typeof obj.size === "number" ? obj.size : obj.fileUrl.length,
      });
    }
    normalizedDocuments = out;
  }

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

  let created: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: "CUSTOMER" | "PARTNER" | "RIDER" | "ADMIN";
    createdAt: Date;
  } | null = null;
  let restaurantId: string | null = null;
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          password: passwordHash,
          phone: normalizedPhone,
          role: "PARTNER",
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
      const partnerProfile = await tx.partnerProfile.create({
        data: { userId: user.id },
      });

      // Bug 2 — when the registration form sent a restaurant
      // payload, create the Restaurant row here (PENDING by
      // default). Skip silently if the form didn't include one
      // (some flows finalise the restaurant later from the
      // dashboard).
      if (normalizedRestaurant) {
        const restaurant = await tx.restaurant.create({
          data: {
            name: normalizedRestaurant.name,
            address: normalizedRestaurant.address,
            cuisine: normalizedRestaurant.cuisine,
            ownerId: user.id,
            partnerProfileId: partnerProfile.id,
            // Bug fix — persist the lat/lng the registration form's
            // AddressPicker collected. The values are already in
            // their valid numeric ranges (re-validated above) so we
            // just forward them. When the partner skipped the pin
            // step the column is null and the dashboard's location
            // editor can fill it in later.
            latitude: normalizedRestaurant.latitude,
            longitude: normalizedRestaurant.longitude,
            // deliveryTime + deliveryFee are required by the schema
            // (legacy columns from the original restaurant
            // onboarding). Reasonable defaults so the row inserts
            // cleanly; the partner can change these from the
            // dashboard.
            deliveryTime: 30,
            deliveryFee: 0,
            openingHours: "",
          },
          select: { id: true },
        });
        restaurantId = restaurant.id;

        // And the documents — one row per uploaded file.
        if (normalizedDocuments) {
          for (const d of normalizedDocuments) {
            await tx.restaurantDocument.create({
              data: {
                restaurantId: restaurant.id,
                documentType: d.documentType,
                fileUrl: d.fileUrl,
              },
            });
          }
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
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      // FK violation — usually means a referenced User id
      // vanished mid-transaction, which can't actually happen
      // here since we just created it. Surface a generic 500.
      console.error("register/partner: FK violation", err);
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

  return NextResponse.json(
    { user: created, restaurantId, token },
    { status: 201 },
  );
}