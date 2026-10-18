/**
 * SSLCommerz sandbox integration helper.
 *
 * The gateway is just two REST endpoints:
 *
 *   • INIT        — POST https://sandbox.sslcommerz.com/gwprocess/v4/api.php
 *                   (live:  https://securepay.sslcommerz.com/gwprocess/v4/api.php)
 *                   body is a URL-encoded form. Returns either `{ status: "FAILED" }`
 *                   or a `{ GatewayPageURL, sessionKey, ... }` object.
 *
 *   • VALIDATION  — GET https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php
 *                   query string with `val_id`, `store_id`, `store_passwd`.
 *                   Returns `{ status: "VALID" | "INVALID" | ... }` plus the
 *                   full txn detail.
 *
 * We deliberately do NOT install `sslcommerz-lts` — the SDK is a 200-line
 * wrapper around these two endpoints and ships its own (older) `axios`
 * dependency that would bloat the bundle for two HTTPS calls. The
 * surface is small enough that the helper below is the entire contract.
 *
 * IMPORTANT — security:
 *   • The success / fail / cancel callbacks are browser-driven and
 *     spoofable. NEVER trust them to confirm a transaction. Any
 *     code path that flips `paymentGatewayStatus` to `PAID` MUST
 *     first call `validateTransaction(valId)` server-to-server.
 *   • Only `https://sandbox.sslcommerz.com` is reachable in dev
 *     because the credentials in `.env` are sandbox creds. The
 *     `SSLCZ_IS_SANDBOX` flag is the only switch.
 */

const SANDBOX_INIT_URL =
  "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
const SANDBOX_VALIDATION_URL =
  "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

const LIVE_INIT_URL = "https://securepay.sslcommerz.com/gwprocess/v4/api.php";
const LIVE_VALIDATION_URL =
  "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php";

export type SslczInitInput = {
  readonly total_amount: number;
  readonly currency: string;
  readonly tran_id: string;
  readonly success_url: string;
  readonly fail_url: string;
  readonly cancel_url: string;
  readonly ipn_url: string;
  readonly product_name: string;
  readonly product_category: string;
  readonly product_profile: string;
  readonly cus_name: string;
  readonly cus_email: string;
  readonly cus_phone: string;
  readonly cus_add1: string;
  readonly cus_city?: string;
  readonly cus_country?: string;
  readonly shipping_method?: string;
  readonly num_of_item?: number;
};

export type SslczInitResponse =
  | {
      status: "SUCCESS";
      GatewayPageURL: string;
      sessionKey: string;
      redirectGatewayURL?: string;
      redirectGatewayURLFailed?: string;
      storeBanner?: string;
      storeLogo?: string;
    }
  | {
      status: "FAILED";
      failedreason?: string;
    };

export type SslczValidationResponse = {
  status: "VALID" | "INVALID" | "VALIDATED" | "FAKENENT" | "EXPIRED";
  /** Set on VALID responses — this is the bank's txn id we should store. */
  bank_tran_id?: string;
  tran_id?: string;
  tran_date?: string;
  amount?: string;
  card_type?: string;
  card_no?: string;
  /** When status is VALIDATED, the gateway had already been told this
   *  payment was successful once. We treat both VALID and VALIDATED as
   *  success — IPN replays land here. */
  currency?: string;
  error?: string;
};

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `${name} is not configured. Add it to .env before talking to SSLCommerz.`,
    );
  }
  return v;
}

function isSandbox(): boolean {
  return (process.env.SSLCZ_IS_SANDBOX ?? "true").toLowerCase() === "true";
}

/**
 * Upgrade `http://` → `https://` for public hosts only.
 *
 * SSLCommerz refuses a plain-http callback on a real domain (it
 * wants the redirect to be secure), so a production
 * `APP_BASE_URL` of `http://khaidai.com` would silently break.
 * But localhost must keep `http://` — our dev server has no TLS,
 * so rewriting `http://localhost:3000` to `https://localhost:3000`
 * makes the gateway bounce the customer's browser at a dead port
 * (net::ERR_CONNECTION_REFUSED) and the payment is captured with
 * nobody ever confirming it.
 *
 * So: upgrade only when the host isn't a loopback address.
 */
function ensureHttps(url: string): string {
  if (!/^http:\/\//i.test(url)) return url;
  try {
    const { hostname } = new URL(url);
    const isLoopback =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1" ||
      hostname.endsWith(".local");
    if (isLoopback) return url;
  } catch {
    /* not a parseable URL — leave it alone */
  }
  return url.replace(/^http:\/\//i, "https://");
}

export function getSslczConfig() {
  return {
    storeId: requireEnv("SSLCZ_STORE_ID"),
    storePassword: requireEnv("SSLCZ_STORE_PASSWORD"),
    sandbox: isSandbox(),
    initUrl: isSandbox() ? SANDBOX_INIT_URL : LIVE_INIT_URL,
    validationUrl: isSandbox() ? SANDBOX_VALIDATION_URL : LIVE_VALIDATION_URL,
    baseUrl: ensureHttps(requireEnv("APP_BASE_URL")),
  };
}

/* -------------------------------------------------------------------------- */
/*  initSession                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Hit SSLCommerz's init endpoint with the gateway form-fields. Throws
 * on transport / parse errors; the caller should treat a
 * `{ status: "FAILED" }` body as a normal flow failure (e.g. suspend
 * the order, surface to the user) and only throw on the rare network
 * case so the route handler can return 502.
 */
export async function initSession(
  input: SslczInitInput,
): Promise<SslczInitResponse> {
  const cfg = getSslczConfig();

  const body = new URLSearchParams();
  body.set("store_id", cfg.storeId);
  body.set("store_passwd", cfg.storePassword);
  body.set("total_amount", String(input.total_amount));
  body.set("currency", input.currency);
  body.set("tran_id", input.tran_id);
  body.set("success_url", ensureHttps(input.success_url));
  body.set("fail_url", ensureHttps(input.fail_url));
  body.set("cancel_url", ensureHttps(input.cancel_url));
  body.set("ipn_url", ensureHttps(input.ipn_url));
  body.set("product_name", input.product_name);
  body.set("product_category", input.product_category);
  body.set("product_profile", input.product_profile);
  body.set("cus_name", input.cus_name);
  body.set("cus_email", input.cus_email);
  body.set("cus_phone", input.cus_phone);
  body.set("cus_add1", input.cus_add1);
  body.set("cus_country", input.cus_country ?? "Bangladesh");
  body.set("shipping_method", input.shipping_method ?? "NO");
  body.set(
    "num_of_item",
    String(input.num_of_item ?? 1),
  );

  const res = await fetch(cfg.initUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    // The init endpoint is on a different host — Next's dedupe cache
    // is fine to skip, but we also can't ship the static-default
    // Next cache here because each call carries a fresh tran_id.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`SSLCommerz init HTTP ${res.status}`);
  }

  // SSLCommerz returns JSON. Be defensive: an HTML error page from a
  // proxy would otherwise blow up JSON.parse.
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `SSLCommerz init returned non-JSON body: ${text.slice(0, 200)}`,
    );
  }

  const obj = parsed as {
    status?: string;
    GatewayPageURL?: string;
    // NOTE — the real API returns `sessionkey` (all lowercase). Some
    // docs/SDK examples show `sessionKey`, so we accept either rather
    // than silently degrading a successful session into a failure.
    sessionkey?: string;
    sessionKey?: string;
    failedreason?: string;
    redirectGatewayURL?: string;
    redirectGatewayURLFailed?: string;
  };

  const sessionKey = obj.sessionkey ?? obj.sessionKey;

  if (
    obj.status === "SUCCESS" &&
    typeof obj.GatewayPageURL === "string" &&
    typeof sessionKey === "string"
  ) {
    return {
      status: "SUCCESS",
      GatewayPageURL: obj.GatewayPageURL,
      sessionKey,
      // Useful for debugging a "customer never left the checkout"
      // report — the bank-specific deep link is in here too.
      redirectGatewayURL:
        typeof obj.redirectGatewayURL === "string"
          ? obj.redirectGatewayURL
          : undefined,
      redirectGatewayURLFailed:
        typeof obj.redirectGatewayURLFailed === "string"
          ? obj.redirectGatewayURLFailed
          : undefined,
    };
  }
  return { status: "FAILED", failedreason: obj.failedreason };
}

/* -------------------------------------------------------------------------- */
/*  validateTransaction                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Server-to-server validation. Per SSLCommerz docs you MUST call this
 * from your server after every `success_url` / `ipn` callback before
 * trusting the transaction.
 *
 *   • Treat `status === "VALID"` as success.
 *   • Treat `status === "VALIDATED"` as success (this is a duplicate
 *     IPN / re-validation of an already-paid txn).
 *   • Anything else (INVALID / EXPIRED / FAKENENT / transport error)
 *     means we MUST NOT mark the order as paid.
 */
export async function validateTransaction(
  valId: string,
): Promise<SslczValidationResponse> {
  const cfg = getSslczConfig();

  const url = new URL(cfg.validationUrl);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", cfg.storeId);
  url.searchParams.set("store_passwd", cfg.storePassword);

  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    return { status: "INVALID", error: `HTTP ${res.status}` };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      status: "INVALID",
      error: `non-JSON validation body: ${text.slice(0, 200)}`,
    };
  }

  return parsed as SslczValidationResponse;
}

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Convenience for the route layer — caller passes the Order row, we
 *  assemble the gateway form-fields. */
export function buildInitInput(opts: {
  orderId: string;
  total: number;
  customer: { name: string; email: string; phone: string | null };
  deliveryAddress: string;
  items: Array<{ name: string; quantity: number }>;
}): SslczInitInput {
  const base = getSslczConfig().baseUrl;
  const numOfItems = opts.items.reduce((n, i) => n + i.quantity, 0) || 1;
  return {
    total_amount: opts.total,
    currency: "BDT",
    tran_id: opts.orderId,
    success_url: `${base}/api/payments/sslcommerz/success`,
    fail_url: `${base}/api/payments/sslcommerz/fail`,
    cancel_url: `${base}/api/payments/sslcommerz/cancel`,
    ipn_url: `${base}/api/payments/sslcommerz/ipn`,
    product_name: opts.items[0]?.name ?? "KhaiDai Order",
    product_category: "Food",
    product_profile: "physical-goods",
    cus_name: opts.customer.name,
    cus_email: opts.customer.email,
    cus_phone: opts.customer.phone ?? "01700000000",
    cus_add1: opts.deliveryAddress,
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    shipping_method: "NO",
    num_of_item: numOfItems,
  };
}