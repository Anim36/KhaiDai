"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, TicketIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Homepage "Promo / Offers" carousel.
 *
 * Renders one card per currently-redeemable promo code, fetched from
 * `/api/promo-codes/active`. Each card carries a Copy Code button
 * that copies the code to the clipboard and flashes a "Copied!" toast
 * for ~1.4s. If the API returns no active promos (or the fetch
 * errors) the whole section is hidden so the homepage never shows an
 * empty header.
 *
 * All UI copy comes from the i18n dictionary via `useT()` so this
 * carousel flips with the rest of the homepage when the user toggles
 * Bangla/English.
 */

const CARD_WIDTH = 272; // px — compact but still shows full code
const GAP = 14;

export function PromoCarousel() {
  const t = useT();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; promos: ActivePromo[] }
    | { kind: "empty" }
  >({ kind: "loading" });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/promo-codes/active", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setState({ kind: "empty" });
          return;
        }
        const data = (await res.json()) as { promos?: ActivePromo[] };
        const list = Array.isArray(data?.promos) ? data.promos : [];
        if (!cancelled) {
          setState(
            list.length === 0
              ? { kind: "empty" }
              : { kind: "ready", promos: list },
          );
        }
      } catch {
        if (!cancelled) setState({ kind: "empty" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const onCopy = useCallback(async (code: string) => {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(code);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedCode(code);
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
      toastTimer.current = window.setTimeout(() => {
        setCopiedCode(null);
        toastTimer.current = null;
      }, 1400);
    } catch {
      /* swallow — no toast */
    }
  }, []);

  if (state.kind === "loading" || state.kind === "empty") return null;

  return (
    <PromoCarouselView
      promos={state.promos}
      onCopy={onCopy}
      copiedCode={copiedCode}
      copyLabel={t("home.copyCode")}
      copiedLabel={t("home.copied")}
      promoCodeEyebrow={t("home.promoCode")}
      scrollLeftLabel={t("home.promoScrollLeft")}
      scrollRightLabel={t("home.promoScrollRight")}
    />
  );
}

function PromoCarouselView({
  promos,
  onCopy,
  copiedCode,
  copyLabel,
  copiedLabel,
  promoCodeEyebrow,
  scrollLeftLabel,
  scrollRightLabel,
}: {
  promos: ActivePromo[];
  onCopy: (code: string) => void;
  copiedCode: string | null;
  copyLabel: string;
  copiedLabel: string;
  promoCodeEyebrow: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = track;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(track);
    window.addEventListener("resize", update);
    return () => {
      track.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [promos.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      track.scrollBy({ left: e.deltaY, behavior: "auto" });
      e.preventDefault();
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, []);

  const scrollByCard = useCallback((dir: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * (CARD_WIDTH + GAP), behavior: "smooth" });
  }, []);

  return (
    <section
      aria-label="Active promo offers"
      className="relative w-full px-4 py-6 sm:px-6 lg:px-[64px]"
    >
      <div
        ref={trackRef}
        className="promo-track flex w-full snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-2"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {promos.map((p, idx) => {
          const accent = idx % 2 === 0 ? "red" : "orange";
          const isCopied = copiedCode === p.code;
          return (
            <article
              key={p.id}
              style={{
                width: CARD_WIDTH,
                flex: `0 0 ${CARD_WIDTH}px`,
              }}
              className={`snap-start flex h-[220px] flex-col overflow-hidden rounded-[16px] border bg-white shadow-sm ${
                accent === "red"
                  ? "border-brand-200"
                  : "border-brand-accent/40"
              }`}
            >
              <div
                aria-hidden
                className={`relative h-[108px] w-full overflow-hidden ${
                  accent === "red"
                    ? "bg-gradient-to-br from-brand-100 to-brand-200"
                    : "bg-gradient-to-br from-brand-200 to-orange-100"
                }`}
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center ${
                      accent === "red"
                        ? "text-brand"
                        : "text-brand-accent"
                    }`}
                  >
                    <TicketIcon size={56} />
                  </div>
                )}
                <div
                  className={`absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide shadow-sm ${
                    accent === "red"
                      ? "bg-brand text-white"
                      : "bg-brand-accent text-white"
                  }`}
                >
                  {p.discountType === "PERCENTAGE"
                    ? `${p.discountValue}% OFF`
                    : `৳${p.discountValue.toLocaleString()} OFF`}
                </div>
              </div>

              <div
                className={`flex flex-1 flex-col justify-between gap-1.5 px-4 py-3 ${
                  accent === "red" ? "bg-brand-50" : "bg-white"
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <p
                    className={`font-display text-[13px] font-bold leading-tight ${
                      accent === "red"
                        ? "text-brand"
                        : "text-brand-accent"
                    }`}
                  >
                    {p.description}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                    {promoCodeEyebrow}
                  </p>
                  <p className="break-all font-display text-[16px] font-extrabold leading-tight text-ink">
                    {p.code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCopy(p.code)}
                  aria-label={`Copy promo code ${p.code}`}
                  className={`mt-1 inline-flex h-8 w-full items-center justify-center gap-2 rounded-full px-3 text-[11px] font-bold transition-colors ${
                    isCopied
                      ? "bg-emerald-500 text-white"
                      : accent === "red"
                        ? "bg-brand text-white hover:bg-brand-600"
                        : "bg-brand-accent text-white hover:bg-brand-accent/90"
                  }`}
                >
                  {isCopied ? copiedLabel : copyLabel}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {canScrollLeft ? (
        <ArrowButton
          direction="left"
          onClick={() => scrollByCard(-1)}
          ariaLabel={scrollLeftLabel}
        />
      ) : null}
      {canScrollRight ? (
        <ArrowButton
          direction="right"
          onClick={() => scrollByCard(1)}
          ariaLabel={scrollRightLabel}
        />
      ) : null}
    </section>
  );
}

function ArrowButton({
  direction,
  onClick,
  ariaLabel,
}: {
  direction: "left" | "right";
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand shadow-md ring-1 ring-brand-200 transition-opacity hover:opacity-90 md:flex ${
        direction === "left" ? "left-3" : "right-3"
      }`}
    >
      <span
        style={{
          transform: direction === "left" ? "rotate(180deg)" : undefined,
          display: "inline-flex",
        }}
      >
        <ArrowRightIcon size={16} />
      </span>
    </button>
  );
}

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
  restaurantId: string | null;
  restaurantName: string | null;
};