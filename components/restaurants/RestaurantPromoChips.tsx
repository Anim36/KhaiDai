"use client";

import { useState } from "react";
import { TicketIcon } from "@/components/icons";

/**
 * Shape of a single restaurant-scoped promo row, surfaced by
 * `GET /api/restaurants/[id]` (কাজ ৪). Matches the columns the
 * route selects from Prisma — keeps the customer's page-light.
 */
export type RestaurantPromo = {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED" | string;
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  expiresAt: string | Date | null;
};

type Props = {
  promos: RestaurantPromo[];
};

/** Compact summary used by the chip pill (e.g. "SAVE20 · 20% off"). */
function shortLabel(p: RestaurantPromo): string {
  const pct =
    p.discountType === "PERCENTAGE"
      ? `${p.discountValue}% off`
      : `৳${p.discountValue} off`;
  return `${p.code} · ${pct}`;
}

function fullDate(d: string | Date | null): string | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Horizontal chip-row + "View all offers" modal for the
 * restaurant-scoped promo codes returned by
 * `GET /api/restaurants/[id]`.
 *
 *   • Each chip is a small pill rendering `code · description`.
 *   • Clicking a chip (or "View all offers") opens a modal that
 *     shows every active promo's full detail — code, description,
 *     min-order, max-discount, expiry — so the customer doesn't
 *     have to navigate away.
 *   • Empty state: if the partner has no active codes we render
 *     nothing (silent), so the page looks clean by default.
 *
 * কাজ ৪ — mirrors the Foodpanda "Offers" section style.
 */
export function RestaurantPromoChips({ promos }: Props) {
  const [openModal, setOpenModal] = useState(false);

  if (!promos || promos.length === 0) return null;

  return (
    <>
      <section
        aria-label="Active offers"
        data-restaurant-promos="true"
        className="flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
            Offers
          </h2>
          {promos.length > 1 ? (
            <button
              type="button"
              onClick={() => setOpenModal(true)}
              data-action="view-all-offers"
              className="text-[12px] font-semibold text-brand hover:underline"
            >
              View all offers
            </button>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap gap-2 overflow-x-auto md:flex-nowrap">
          {promos.slice(0, 4).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenModal(true)}
              data-restaurant-promo-chip="true"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-100"
            >
              <TicketIcon size={14} />
              <span>{shortLabel(p)}</span>
            </button>
          ))}
          {promos.length > 4 ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
              +{promos.length - 4} more
            </span>
          ) : null}
        </div>
      </section>

      {openModal ? (
        <PromoModal
          promos={promos}
          onClose={() => setOpenModal(false)}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  PromoModal                                                                */
/* -------------------------------------------------------------------------- */

function PromoModal({
  promos,
  onClose,
}: {
  promos: RestaurantPromo[];
  onClose: () => void;
}) {
  // Esc to close.
  if (typeof window !== "undefined") {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, { once: true });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rest-promo-modal-title"
      data-restaurant-promos-modal="true"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-[560px] flex-col gap-5 rounded-3xl border border-line bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between gap-3">
          <h2
            id="rest-promo-modal-title"
            className="font-display text-[20px] font-extrabold leading-tight text-ink"
          >
            Offers at this restaurant
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface"
          >
            ✕
          </button>
        </header>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {promos.map((p) => {
            const pct =
              p.discountType === "PERCENTAGE"
                ? `${p.discountValue}% off`
                : `৳${p.discountValue} off`;
            const expiry = fullDate(p.expiresAt);
            return (
              <article
                key={p.id}
                data-restaurant-promo-card="true"
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-[16px] font-bold text-ink">
                    {p.code}
                  </span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[12px] font-bold text-amber-800">
                    {pct}
                  </span>
                </div>
                {p.description ? (
                  <p className="text-[13px] text-ink-muted">{p.description}</p>
                ) : null}
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                  {p.minOrderAmount ? (
                    <li>Min order: ৳{p.minOrderAmount}</li>
                  ) : null}
                  {p.maxDiscount ? (
                    <li>Up to ৳{p.maxDiscount}</li>
                  ) : null}
                  {expiry ? <li>Expires {expiry}</li> : null}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}