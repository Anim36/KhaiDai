import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { MAX_DOC_DATA_URL_CHARS } from "@/lib/upload-limits";

/**
 * POST /api/riders/me/documents — upload a verification document
 * for the signed-in RIDER.
 *
 * Mirrors the restaurant flow at
 * `app/api/restaurants/[id]/documents/route.ts`:
 *   • Body: { documentType: "NID" | "DRIVING_LICENSE" |
 *     "VEHICLE_REGISTRATION" | "OTHER", fileUrl: <base64 data URL> }
 *   • One document per type; uploading the same type again
 *     replaces the previous row.
 *   • Owner-only — the rider can only attach documents to their
 *     OWN profile.
 *   • Returns 201 on success.
 *
 * GET returns the rider's document list so the rider dashboard can
 * render "You uploaded: NID (today)" hints.
 */
const VALID_DOC_TYPES = new Set([
  "NID",
  "DRIVING_LICENSE",
  "VEHICLE_REGISTRATION",
  "OTHER",
] as const);

type DocType =
  | "NID"
  | "DRIVING_LICENSE"
  | "VEHICLE_REGISTRATION"
  | "OTHER";

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
  const v = body as Record<string, unknown>;

  if (
    typeof v.documentType !== "string" ||
    !VALID_DOC_TYPES.has(v.documentType as DocType)
  ) {
    return NextResponse.json(
      {
        error:
          "documentType must be one of NID | DRIVING_LICENSE | VEHICLE_REGISTRATION | OTHER",
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
      { error: "fileUrl is too large (max 10 MB raw)" },
      { status: 400 },
    );
  }

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

  const documentType = v.documentType as DocType;
  const fileUrl = v.fileUrl;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.riderDocument.deleteMany({
        where: { riderProfileId: profile.id, documentType },
      });
      await tx.riderDocument.create({
        data: {
          riderProfileId: profile.id,
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
        error:
          err instanceof Error ? err.message : "Failed to upload document",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "RIDER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const profile = await prisma.riderProfile.findUnique({
    where: { userId: auth.user.id },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json({ documents: [] }, { status: 200 });
  }
  const docs = await prisma.riderDocument.findMany({
    where: { riderProfileId: profile.id },
    orderBy: { uploadedAt: "asc" },
  });
  return NextResponse.json({ documents: docs }, { status: 200 });
}