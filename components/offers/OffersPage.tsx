"use client";

import { useCallback, useEffect, useState } from "react";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { apiFetch } from "@/lib/apiClient";

/**
 * /offers — promo / discount offers landing page.
 *
 * Pulls the same `/api/promo-codes/active` feed the homepage carousel
 * uses — the page is intentionally a wider, more readable layout of
 * the same live data so anything a partner creates in their
 * dashboard shows up here on the next refresh.
 *
 * Layout matches the homepage design system (Outfit via font-display,
 * the brand red, surface tokens) and reuses the shared TopNav and
 * Footer chrome so customers land somewhere familiar.
 *
 *   • Header — title + 1-line subtitle explaining how the codes apply.
 *   • Offer grid — 1 col mobile, 2 col md, 3 col xl. Each card shows
 *     the savings headline, code, minimum order, expiry, and — when
 *     the code is scoped to a partner restaurant — a small "Only at
 *     <restaurant>" badge.
 *   • Copy Code button writes the code to the clipboard with a
 *     graceful fallback for environments without `navigator.clipboard`
 *     (older mobile browsers, sandboxed iframes).
 *   • Empty state when there are no active codes — "No active offers
 *     right now. Check back soon!".
 */

type ActivePromo = {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  description: string;
  imageUrl: string | null;
  /** When set, the code only applies to that restaurant's items. */
  restaurantId: string | null;
  /** Convenience — null for platform-wide codes. */
  restaurantName: string | null;
};

/**
 * Human-readable expiry like "31 Aug 2025", or "Until 31 Aug 2025" /
 * "Expires today" / "Expires tomorrow" / "Expires in 3 days" when
 * the date is close. Null when there's no expiry.
 */
function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  // Drop the time component for the day-difference math.
  const dayDiff = Math.floor(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86_400_000,
  );
  if (dayDiff < 0) return "Expired"; // defensive — the API filters these
  if (dayDiff === 0) return "Expires today";
  if (dayDiff === 1) return "Expires tomorrow";
  if (dayDiff < 14) return `Expires in ${dayDiff} days`;
  return `Until ${d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

/**
 * Discount accent colour. Cycles through brand/red/orange/yellow so
 * a row of cards reads varied — same palette the homepage carousel
 * uses so the brand surface stays consistent.
 */
function accentFor(p: ActivePromo): "red" | "orange" | "yellow" | "brand" {
  // Stable hash of the id → 0..3 — same code always gets the same
  // colour even across re-renders.
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0;
  const variants: Array<"red" | "orange" | "yellow" | "brand"> = [
    "red",
    "orange",
    "yellow",
    "brand",
  ];
  return variants[Math.abs(h) % variants.length];
}

function accentClasses(accent: "red" | "orange" | "yellow" | "brand") {
  switch (accent) {
    case "red":
      return "bg-brand-50 text-brand";
    case "orange":
      return "bg-brand-100 text-brand-accent";
    case "yellow":
      return "bg-brand-200 text-brand-accent";
    case "brand":
    default:
      return "bg-brand text-white";
  }
}

export function OffersPage() {
  const [promos, setPromos] = useState<ActivePromo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ promos?: ActivePromo[] }>(
      "/api/promo-codes/active",
    );
    if (!res.ok) {
      setError(res.error.message);
      setPromos([]);
      return;
    }
    setPromos(Array.isArray(res.data?.promos) ? res.data.promos : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(async (code: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback for older browsers / sandboxed contexts.
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedCode(code);
      window.setTimeout(
        () =>
          setCopiedCode((c) => (c === code ? null : c)),
        1600,
      );
    } catch {
      /* copy isn't critical — the user can still read the code and
         type it manually. */
    }
  }, []);

  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-6 pb-20 pt-10 md:px-[64px]">
        <header className="flex flex-col gap-2 pb-8">
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[40px]">
            Current Offers &amp; Promos
          </h1>
          <p className="text-[14px] text-ink-muted md:text-[15px]">
            Save on every order with these active KhaiDai promo codes.
            Copy the code at checkout to redeem.
          </p>
        </header>

        {error ? (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
          >
            Couldn&apos;t load offers: {error}
          </div>
        ) : null}

        {promos === null ? (
          // Skeleton while the first fetch resolves.
          <div
            role="status"
            aria-live="polite"
            className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[260px] animate-pulse rounded-2xl border border-line bg-white"
              />
            ))}
          </div>
        ) : promos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-12 text-center">
            <span className="font-display text-[18px] font-extrabold text-ink">
              No active offers right now
            </span>
            <p className="max-w-sm text-[13px] text-ink-muted">
              Check back soon — new promos are added all the time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {promos.map((p) => (
              <OfferCard
                key={p.id}
                promo={p}
                accent={accentFor(p)}
                copied={copiedCode === p.code}
                onCopy={copy}
              />
            ))}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Offer card                                                                */
/* -------------------------------------------------------------------------- */

function OfferCard({
  promo,
  accent,
  copied,
  onCopy,
}: {
  promo: ActivePromo;
  accent: "red" | "orange" | "yellow" | "brand";
  copied: boolean;
  onCopy: (code: string) => void;
}) {
  const expiry = formatExpiry(promo.expiresAt);
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            "inline-flex h-12 items-center rounded-xl px-4 font-display text-[18px] font-extrabold " +
            accentClasses(accent)
          }
        >
          {promo.description}
        </span>
        {promo.restaurantName ? (
          <span
            className="inline-flex max-w-[55%] items-center rounded-full bg-surface-soft px-3 py-1 text-[11px] font-semibold text-ink-muted"
            title={`Only valid at ${promo.restaurantName}`}
          >
            Only at {promo.restaurantName}
          </span>
        ) : null}
      </div>

      <p className="text-[13px] leading-relaxed text-ink-muted">
        {promo.restaurantName
          ? `Valid only on orders from ${promo.restaurantName}.`
          : "Valid on any order from any KhaiDai restaurant."}
      </p>

      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4 text-[13px] text-ink-muted">
        {promo.minOrderAmount !== null && promo.minOrderAmount > 0 ? (
          <div className="flex items-center justify-between">
            <span>Min order</span>
            <span className="font-semibold text-ink">
              ৳{promo.minOrderAmount}
            </span>
          </div>
        ) : null}
        {expiry ? (
          <div className="flex items-center justify-between">
            <span>Valid</span>
            <span className="font-semibold text-ink">{expiry}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span>Valid</span>
            <span className="font-semibold text-ink">No expiry</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface-soft px-3 py-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">
            Code
          </span>
          <span
            data-promo-code={promo.code}
            className="break-all font-display text-[14px] font-extrabold tracking-widest text-brand"
          >
            {promo.code}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onCopy(promo.code)}
          data-action="copy-promo-code"
          data-promo-code={promo.code}
          aria-label={`Copy code ${promo.code}`}
          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-xl bg-brand text-[13px] font-bold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {copied ? "Copied!" : "Copy Code"}
        </button>
      </div>
    </article>
  );
}