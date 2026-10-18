import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import {
  MAX_DOC_DATA_URL_CHARS,
  MAX_DOC_BYTES_MB,
} from "@/lib/upload-limits";

/**
 * Document upload helper used by /api/restaurants/[id]/documents.
 *
 * The spec calls for "Trade License, Owner NID/ID, Food Safety
 * Certificate (or whatever else)" — so we accept any of the four
 * enum values (TRADE_LICENSE, OWNER_NID, FOOD_SAFETY_CERT, OTHER)
 * and let the partner upload one document per call.
 *
 * Wire format: the partner sends a base64 data URL inside a JSON
 * body, the same way menu-item images and the restaurant cover
 * image are uploaded. Storing the raw data URL keeps everything
 * inside Postgres — no S3 / Cloudinary dependency for the demo
 * data. Production would swap this for a signed-URL upload flow.
 *
 * Constraints:
 *   • Owner-only — the partner who owns the restaurant can add
 *     documents to it.
 *   • Max file size: 10 MB (data URL string length, since the
 *     upload body is the data URL itself).
 *   • The restaurant must exist and be owned by the caller.
 *   • Replacing an existing document of the same type is allowed
 *     — we delete the prior row first so the admin queue only ever
 *     shows the latest version of each document.
 */
const VALID_DOC_TYPES = new Set([
  "TRADE_LICENSE",
  "OWNER_NID",
  "FOOD_SAFETY_CERT",
  "OTHER",
] as const);

type DocType = "TRADE_LICENSE" | "OWNER_NID" | "FOOD_SAFETY_CERT" | "OTHER";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "PARTNER") {
    return NextResponse.json(
      { error: "Only partners can upload restaurant documents" },
      { status: 403 },
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
  const v = body as Record<string, unknown>;

  if (typeof v.documentType !== "string" || !VALID_DOC_TYPES.has(v.documentType as DocType)) {
    return NextResponse.json(
      {
        error:
          "documentType must be one of TRADE_LICENSE | OWNER_NID | FOOD_SAFETY_CERT | OTHER",
      },
      { status: 400 },
    );
  }
  if (typeof v.fileUrl !== "string") {
    return NextResponse.json(
      { error: "fileUrl (base64 data URL) is required" },
      { status: 400 },
    );
  }
  if (v.fileUrl.length > MAX_DOC_DATA_URL_CHARS) {
    return NextResponse.json(
      {
        error: `fileUrl must be at most ${MAX_DOC_BYTES_MB} MB`,
      },
      { status: 400 },
    );
  }

  // Confirm ownership — the partner can only attach documents to
  // their own restaurant.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.id },
    select: { id: true, ownerId: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: "Restaurant not found" },
      { status: 404 },
    );
  }
  if (restaurant.ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "You can only upload documents for your own restaurant" },
      { status: 403 },
    );
  }

  const documentType = v.documentType as DocType;
  const fileUrl = v.fileUrl;

  try {
    // Idempotent replace: if a document of the same type exists,
    // drop it first so the admin queue only ever shows the latest
    // version. Cascade via the restaurant's relation.
    await prisma.$transaction(async (tx) => {
      await tx.restaurantDocument.deleteMany({
        where: { restaurantId: params.id, documentType },
      });
      await tx.restaurantDocument.create({
        data: {
          restaurantId: params.id,
          documentType,
          fileUrl,
        },
      });
    });
    return NextResponse.json(
      { ok: true, documentType },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to upload document",
      },
      { status: 500 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Public — admin queue + partner dashboard both fetch this to
  // render the document list. The data URLs themselves are large
  // (image/PDF data is embedded) so we return them inline rather
  // than exposing them as separate signed URLs.
  const docs = await prisma.restaurantDocument.findMany({
    where: { restaurantId: params.id },
    orderBy: { uploadedAt: "asc" },
  });
  return NextResponse.json({ documents: docs }, { status: 200 });
}