// lib/mailer.ts
//
// Thin nodemailer wrapper around the Gmail SMTP endpoint. Centralises:
//
//   1. Transporter creation (cached for the process lifetime —
//      nodemailer's docs recommend reusing a single transporter
//      rather than rebuilding it per send so connection pooling
//      works).
//   2. The `sendOtpEmail(to, otp, purpose)` convenience helper that
//      formats the OTP email (subject + HTML body + plain-text
//      fallback). The customer-facing copy intentionally mirrors
//      what the registration UI shows, so a user receiving the
//      email knows exactly which screen the code goes into.
//   3. Error swallowing — `sendOtpEmail` returns `{ ok: true }` on
//      success and `{ ok: false, reason }` on failure. Callers (the
//      OTP request route) handle the user-visible "couldn't send the
//      code" surface themselves; this module never throws so a
//      transient SMTP outage can't 5xx the registration flow.
//
// SMTP env contract (all read at module-init time, picked up via
// `dotenv/config` in the API routes' import graph):
//   SMTP_HOST  — required
//   SMTP_PORT  — required (Gmail STARTTLS = 587)
//   SMTP_USER  — required (the "From" Gmail account)
//   SMTP_PASS  — required (Gmail app password)
//   SMTP_FROM  — optional, defaults to `SMTP_USER`

import "dotenv/config";
import nodemailer, {
  type SendMailOptions,
  type Transporter,
} from "nodemailer";

/* -------------------------------------------------------------------------- */
/*  Transporter                                                               */
/* -------------------------------------------------------------------------- */

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER;

/**
 * Module-level cache. We deliberately accept the small risk of
 * picking up env changes only on cold-start — dev users almost
 * never rotate SMTP credentials at runtime.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }
  const port = Number(SMTP_PORT);
  if (!Number.isFinite(port) || port <= 0) {
    console.error("mailer: SMTP_PORT is invalid:", SMTP_PORT);
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    // `secure: false` forces STARTTLS (Gmail's 587 path). Setting
    // `secure: true` on port 587 would attempt implicit TLS which
    // Gmail rejects.
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/* -------------------------------------------------------------------------- */
/*  Result type                                                               */
/* -------------------------------------------------------------------------- */

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

/**
 * Was the SMTP layer configured? Exposed so the OTP request route
 * can pre-flight a "mail is disabled in this build" response
 * without attempting to send.
 */
export function isMailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
}

/* -------------------------------------------------------------------------- */
/*  Generic send                                                              */
/* -------------------------------------------------------------------------- */

async function sendMail(opts: SendMailOptions): Promise<SendResult> {
  const tx = getTransporter();
  if (!tx) {
    // No SMTP configured — surface to caller. Don't throw — the OTP
    // route maps this to a generic 503 so the user can retry later
    // instead of crashing the page.
    return { ok: false, reason: "SMTP not configured" };
  }
  try {
    const info = await tx.sendMail({
      from: SMTP_FROM,
      ...opts,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Unknown SMTP failure";
    console.error("mailer: send failed", reason);
    return { ok: false, reason };
  }
}

/* -------------------------------------------------------------------------- */
/*  OTP-specific helper                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Available OTP purposes. Kept as a string-literal union (not a
 * Prisma enum) so client-side code can import it without pulling
 * the whole generated client. The DB column uses an enum with the
 * same value set — see prisma/migrations for the source of truth.
 *
 * কাজ ২ — added `PASSWORD_RESET` for the forgot-password flow.
 * The two purposes share the same EmailOtp table + SHA-256 hash
 * + 10-min TTL + 5-attempt cap; the enum value is just the bucket
 * that keeps the codes from being cross-used.
 */
export type OtpPurpose = "REGISTRATION" | "PASSWORD_RESET";

/**
 * Send a 6-digit verification code to `to`. Body is dual-formatted
 * (HTML + plain-text) so Gmail's "View as HTML" toggle doesn't
 * blank out the email for customers with the conservative setting.
 *
 * Subject is phrased to be scannable in the inbox — "Your KhaiDai
 * verification code" is what users search for when they can't find
 * the email in Promotions / Spam.
 *
 * কাজ ২ — the copy now branches on `purpose` so a user getting a
 * password-reset email sees "Reset your KhaiDai password" instead
 * of "Verify your email". The 6-digit code is the same shape and
 * the 10-minute TTL is the same; only the surrounding prose
 * differs. The subject line also names the purpose so a phishing-
 * conscious user can see at-a-glance which flow the email is for.
 */
export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: OtpPurpose,
): Promise<SendResult> {
  if (!isOtpShapeValid(otp)) {
    return { ok: false, reason: "Invalid OTP shape (must be 6 digits)" };
  }

  // ─── REGISTRATION copy (default / unchanged) ──────────────────────
  const regSubject = `Your KhaiDai verification code`;
  const regText =
    `Your KhaiDai verification code is: ${otp}\n\n` +
    `This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.\n\n` +
    `— Team KhaiDai`;
  const regHtml =
    `<!doctype html><html><body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:24px 0;"><tr><td align="center">` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">` +
    `<tr><td style="padding:32px 32px 8px 32px;">` +
    `<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#111827;">KhaiDai</div>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 24px 32px;">` +
    `<h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#111827;">Verify your email</h1>` +
    `<p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;">Use the code below to finish setting up your account. It expires in <strong>10 minutes</strong>.</p>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:8px 32px 24px 32px;">` +
    `<div style="display:inline-block;padding:18px 32px;background-color:#f3f4f6;border:1px dashed #d1d5db;border-radius:12px;letter-spacing:8px;font-size:30px;font-weight:800;color:#dc2626;">${otp}</div>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 24px 32px;">` +
    `<p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280;">If you didn't request this code, you can safely ignore this email — your account will not be created unless you enter the code.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 32px 32px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:12px;">` +
    `<p style="margin:16px 0 0 0;">— Team KhaiDai</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  // ─── PASSWORD_RESET copy (কাজ ২) ────────────────────────────────
  // Same 10-min TTL, same single 6-digit code. The phrasing is
  // deliberately unambiguous so a phishing-conscious user can tell
  // at a glance this is a *password reset*, not a new signup, and
  // so the "If you didn't request this" footer tells them who to
  // contact (and what the legitimate trigger was).
  const resetSubject = `Reset your KhaiDai password`;
  const resetText =
    `Your KhaiDai password-reset code is: ${otp}\n\n` +
    `Enter this code on the password reset page to choose a new password. It expires in 10 minutes.\n\n` +
    `If you didn't request a password reset, you can safely ignore this email — your password will not change unless you enter the code.\n\n` +
    `— Team KhaiDai`;
  const resetHtml =
    `<!doctype html><html><body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:24px 0;"><tr><td align="center">` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">` +
    `<tr><td style="padding:32px 32px 8px 32px;">` +
    `<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#111827;">KhaiDai</div>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 24px 32px;">` +
    `<h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#111827;">Reset your password</h1>` +
    `<p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;">Use the code below on the password reset screen to choose a new password. It expires in <strong>10 minutes</strong>.</p>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:8px 32px 24px 32px;">` +
    `<div style="display:inline-block;padding:18px 32px;background-color:#f3f4f6;border:1px dashed #d1d5db;border-radius:12px;letter-spacing:8px;font-size:30px;font-weight:800;color:#dc2626;">${otp}</div>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 24px 32px;">` +
    `<p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280;">If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 32px 32px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:12px;">` +
    `<p style="margin:16px 0 0 0;">— Team KhaiDai</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  if (purpose === "PASSWORD_RESET") {
    return sendMail({
      to,
      subject: resetSubject,
      text: resetText,
      html: resetHtml,
    });
  }
  // default / REGISTRATION
  return sendMail({
    to,
    subject: regSubject,
    text: regText,
    html: regHtml,
  });
}

/**
 * কাজ ২ — Security notification sent immediately after a successful
 * password-reset confirm. Stateless JWT means we can't kill active
 * sessions server-side (no session row exists), so this email is
 * the only defence-in-depth signal: if the user didn't trigger the
 * reset themselves, the email tells them to contact support.
 */
export async function sendPasswordChangedNotice(
  to: string,
): Promise<SendResult> {
  if (!isMailConfigured()) {
    return { ok: false, reason: "SMTP not configured" };
  }
  const subject = `Your KhaiDai password was just changed`;
  const text =
    `Your KhaiDai password was just changed.\n\n` +
    `If you made this change, no action is needed — you can now sign in with your new password.\n\n` +
    `If you did NOT make this change, your account may be compromised. Contact KhaiDai support immediately: support@khaidai.local\n\n` +
    `— Team KhaiDai`;
  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:24px 0;"><tr><td align="center">` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">` +
    `<tr><td style="padding:32px 32px 8px 32px;">` +
    `<div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#111827;">KhaiDai</div>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 24px 32px;">` +
    `<h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#111827;">Your password was changed</h1>` +
    `<p style="margin:0;font-size:14px;line-height:1.55;color:#4b5563;">Your KhaiDai password was just reset. If you triggered this, no action is needed.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 24px 32px;">` +
    `<div style="padding:16px;border:1px solid #fde68a;background-color:#fffbeb;border-radius:12px;">` +
    `<p style="margin:0;font-size:13px;line-height:1.55;color:#92400e;"><strong>Didn&rsquo;t do this?</strong> Your account may be compromised. Contact KhaiDai support at <strong>support@khaidai.local</strong> immediately to lock your account.</p>` +
    `</div>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 32px 32px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:12px;">` +
    `<p style="margin:16px 0 0 0;">— Team KhaiDai</p>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return sendMail({ to, subject, text, html });
}

function isOtpShapeValid(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}

/* -------------------------------------------------------------------------- */
/*  Contact-form helper (Feat 3)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Feat 3 — notify the KhaiDai team that a new contact message
 * landed. The recipient is the configured `SMTP_USER` so the
 * notification lands in the same inbox that already receives
 * signup alerts.
 *
 * The body is plain (no fancy styling) so support can scan it
 * quickly without rendering quirks.
 */
export async function sendContactNotification(
  name: string,
  email: string,
  message: string,
): Promise<SendResult> {
  if (!isMailConfigured()) {
    return { ok: false, reason: "SMTP not configured" };
  }
  const subject = `New contact message from ${name}`;
  const text =
    `New contact submission\n\n` +
    `Name: ${name}\n` +
    `Email: ${email}\n\n` +
    `Message:\n${message}\n`;
  return sendMail({
    to: SMTP_USER ?? "",
    subject,
    text,
  });
}

/* -------------------------------------------------------------------------- */
/*  Feat 3 — order receipt email                                              */
/* -------------------------------------------------------------------------- */

/**
 * Shape passed to `sendOrderReceiptEmail`. Caller is expected to
 * hand in the full picture the customer sees in the tracking
 * page so the receipt matches the on-screen experience one-to-
 * one. Denormalised here so the helper has no Prisma
 * dependency and the `PATCH /api/orders/[id]` route can fire it
 * with a single object literal.
 */
export type OrderReceiptInput = {
  /** Display-only order id. */
  shortId: string;
  /** Restaurant name. */
  restaurantName: string;
  /** Restaurant address (line 1). */
  restaurantAddress: string;
  /** Customer's name for the greeting. */
  customerName: string;
  /** Per-line breakdown, with the customer-facing option labels
   *  and line total. */
  items: Array<{
    name: string;
    qty: number;
    lineTotal: number;
    /** Comma-joined customisation labels (e.g. "Large, Extra
     *  Cheese"). Empty string when the line has no options. */
    optionsLabel: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  /** Discount amount applied via promo code (0 when none). */
  discountAmount: number;
  /** Promo code label, e.g. "WELCOME10" (only set when the
   *  customer redeemed one). */
  promoCode: string | null;
  total: number;
  paymentMethod: string;
  deliveryAddress: string;
  /** "12:42 PM · 12 Apr 2025" — already formatted by the caller. */
  deliveredAtLabel: string;
};

/** Format a number as ৳1,234. Matches the rest of the UI. */
function fmtTaka(n: number): string {
  return `৳${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * Send the post-delivery receipt to the customer. Fails
 * silently (returns `{ ok: false, reason }` and logs) — the
 * caller MUST NOT block the order-delivery flow on the result
 * of this call. Receipts are secondary; the primary goal of
 * "Mark delivered" is to settle the order.
 */
export async function sendOrderReceiptEmail(
  to: string,
  receipt: OrderReceiptInput,
): Promise<SendResult> {
  if (!isMailConfigured()) {
    return { ok: false, reason: "SMTP not configured" };
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, reason: "invalid recipient" };
  }

  const subject = `KhaiDai order ${receipt.shortId} — receipt`;

  // Plain-text fallback. Each line kept short so the email
  // renders sanely in a "View as plain text" Gmail tab.
  const itemLines = receipt.items
    .map((it) => {
      const opt = it.optionsLabel ? ` (${it.optionsLabel})` : "";
      return `  ${it.qty}× ${it.name}${opt} — ${fmtTaka(it.lineTotal)}`;
    })
    .join("\n");
  const discountLine = receipt.discountAmount > 0
    ? `Discount${receipt.promoCode ? ` (${receipt.promoCode})` : ""}: -${fmtTaka(receipt.discountAmount)}\n`
    : "";
  const text =
    `Hi ${receipt.customerName || "there"},\n\n` +
    `Thanks for ordering from ${receipt.restaurantName}! Here's your receipt.\n\n` +
    `Order: ${receipt.shortId}\n` +
    `Delivered: ${receipt.deliveredAtLabel}\n` +
    `Restaurant: ${receipt.restaurantName}, ${receipt.restaurantAddress}\n` +
    `Delivery to: ${receipt.deliveryAddress}\n` +
    `Payment: ${receipt.paymentMethod}\n\n` +
    `Items:\n${itemLines || "  (none)"}\n\n` +
    `Subtotal: ${fmtTaka(receipt.subtotal)}\n` +
    `Delivery Fee: ${fmtTaka(receipt.deliveryFee)}\n` +
    `Tax: ${fmtTaka(receipt.tax)}\n` +
    discountLine +
    `Total: ${fmtTaka(receipt.total)}\n\n` +
    `Thanks for choosing KhaiDai.\n`;

  // HTML receipt — KhaiDai branding + orange accent (matches
  // the customer-facing tracking page). Tables rather than
  // flex/grid for maximum email-client compatibility.
  const itemRows = receipt.items
    .map(
      (it) =>
        `<tr>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;">${it.qty}× ${escapeHtml(it.name)}` +
        (it.optionsLabel
          ? `<div style="color:#6b7280;font-size:12px;">${escapeHtml(it.optionsLabel)}</div>`
          : "") +
        `</td>` +
        `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;">${fmtTaka(it.lineTotal)}</td>` +
        `</tr>`,
    )
    .join("");
  const discountRow =
    receipt.discountAmount > 0
      ? `<tr>` +
        `<td style="padding:6px 8px;">Discount${receipt.promoCode ? ` (${escapeHtml(receipt.promoCode)})` : ""}</td>` +
        `<td style="padding:6px 8px;text-align:right;">-${fmtTaka(receipt.discountAmount)}</td>` +
        `</tr>`
      : "";
  const html =
    `<!doctype html><html><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<title>KhaiDai order ${escapeHtml(receipt.shortId)} — receipt</title></head>` +
    `<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px;">` +
    `<div style="background:#ff6a13;color:#ffffff;display:inline-block;padding:6px 12px;border-radius:6px;font-weight:700;letter-spacing:0.5px;">KhaiDai</div>` +
    `<h1 style="margin:16px 0 4px 0;font-size:20px;">Thanks for your order, ${escapeHtml(receipt.customerName || "there")}!</h1>` +
    `<p style="margin:0;color:#6b7280;">Here's your receipt for order <strong>${escapeHtml(receipt.shortId)}</strong>.</p>` +
    `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:16px;">` +
    `<h2 style="margin:0 0 8px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Order</h2>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;">` +
    `<tr><td style="padding:4px 0;color:#6b7280;width:40%;">Order ID</td><td style="padding:4px 0;">${escapeHtml(receipt.shortId)}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280;">Placed</td><td style="padding:4px 0;">${escapeHtml(receipt.deliveredAtLabel)}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280;">Restaurant</td><td style="padding:4px 0;">${escapeHtml(receipt.restaurantName)}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280;">Delivered to</td><td style="padding:4px 0;">${escapeHtml(receipt.deliveryAddress)}</td></tr>` +
    `<tr><td style="padding:4px 0;color:#6b7280;">Payment</td><td style="padding:4px 0;">${escapeHtml(receipt.paymentMethod)}</td></tr>` +
    `</table></div>` +
    `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:16px;">` +
    `<h2 style="margin:0 0 8px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Items</h2>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;">${itemRows}</table>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">` +
    `<tr><td style="padding:4px 8px;color:#6b7280;">Subtotal</td><td style="padding:4px 8px;text-align:right;">${fmtTaka(receipt.subtotal)}</td></tr>` +
    `<tr><td style="padding:4px 8px;color:#6b7280;">Delivery Fee</td><td style="padding:4px 8px;text-align:right;">${fmtTaka(receipt.deliveryFee)}</td></tr>` +
    `<tr><td style="padding:4px 8px;color:#6b7280;">Tax</td><td style="padding:4px 8px;text-align:right;">${fmtTaka(receipt.tax)}</td></tr>` +
    discountRow +
    `<tr><td style="padding:8px;border-top:2px solid #ff6a13;font-weight:700;">Total</td><td style="padding:8px;border-top:2px solid #ff6a13;text-align:right;font-weight:700;color:#ff6a13;">${fmtTaka(receipt.total)}</td></tr>` +
    `</table></div>` +
    `<p style="margin:24px 0 0 0;color:#6b7280;font-size:12px;">KhaiDai · Hot meals, delivered. Need help? Reply to this email or contact support via the app.</p>` +
    `</div></body></html>`;

  return sendMail({ to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
