import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendContactNotification } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rateLimit";

/**
 * Feat 3 — POST /api/contact
 *
 * Public submission endpoint for the /contact form. Anyone can hit
 * this (no auth), but the route:
 *
 *   1. Validates the basic shape (name, email, message).
 *   2. Applies a per-IP + per-email rate limit (1 / minute) so a
 *      malicious script can't dump millions of rows. The state
 *      lives in the `RateLimitEvent` table (see lib/rateLimit.ts)
 *      so a Vercel cold-start doesn't reset the counter.
 *   3. Persists a `ContactMessage` row that surfaces in
 *      /admin/messages.
 *   4. Fires a notification email via lib/mailer. Email failure is
 *      logged but does NOT fail the request — the admin inbox is
 *      a redundancy, not the source of truth (the DB is).
 */
const MIN_INTERVAL_MS = 60_000; // 1 minute
const HOURLY_CAP = 10;

function clientKey(req: NextRequest, email: string) {
  // IP is best-effort: `x-forwarded-for` first, then fall back.
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${ip}|${email.toLowerCase()}`;
}

export async function POST(req: NextRequest) {
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
  const r = body as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const email = typeof r.email === "string" ? r.email.trim() : "";
  const message = typeof r.message === "string" ? r.message.trim() : "";

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "name must be 2-80 characters" },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "email must be a valid address" },
      { status: 400 },
    );
  }
  if (message.length < 5 || message.length > 2000) {
    return NextResponse.json(
      { error: "message must be 5-2000 characters" },
      { status: 400 },
    );
  }

  const key = clientKey(req, email);
  // DB-backed rate limit (1/min cooldown + 10/hr cap). The Map
  // we used to keep in process memory silently reset on every
  // Vercel cold-start, so an attacker could slip past the cap
  // by spinning requests across cold-start windows.
  const decision = await enforceRateLimit({
    scope: "CONTACT_SUBMIT",
    key,
    cooldownMs: MIN_INTERVAL_MS,
    hourlyCap: HOURLY_CAP,
  });
  if (!decision.ok) {
    return NextResponse.json(
      {
        error:
          decision.reason === "cooldown"
            ? "Too many submissions — please wait a minute before trying again."
            : "Too many submissions — please try again later.",
      },
      { status: 429 },
    );
  }

  try {
    const created = await prisma.contactMessage.create({
      data: { name, email, message },
      select: { id: true, createdAt: true },
    });

    // Fire-and-forget email. The DB row is the source of truth;
    // mail is best-effort notification for the on-call team.
    try {
      await sendContactNotification(name, email, message);
    } catch (mailErr) {
      console.error("contact email notification failed", mailErr);
    }

    return NextResponse.json(
      { ok: true, id: created.id, createdAt: created.createdAt.toISOString() },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to submit message",
      },
      { status: 500 },
    );
  }
}