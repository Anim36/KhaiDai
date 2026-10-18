"use client";

import { ChevronIcon, ClockIcon, SlidersIcon } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";

export type SortKey = "relevance" | "rating" | "delivery";

type Props = {
  total: number;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
};

export function ListingHeader({ total, sort, onSortChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Localised sort labels — keyed by the same SortKey so callers can
  // keep passing stable identifiers and the rendered copy follows the
  // active locale.
  const SORT_LABELS: Record<SortKey, string> = {
    relevance: t("listingHeader.popularity"),
    rating: t("listingHeader.rating"),
    delivery: t("listingHeader.deliveryTime"),
  };

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1 sm:gap-2">
        <h1 className="font-display text-[26px] font-extrabold leading-none text-ink sm:text-[40px]">
          {t("restaurantsPage.title")}
        </h1>
        <p className="text-[14px] font-medium text-ink-muted sm:text-[15px]">
          {t("restaurantsPage.subtitle", { total })}
        </p>
      </div>

      <div ref={ref} className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[14px] font-bold text-ink hover:bg-surface-soft"
        >
          <SlidersIcon size={16} className="text-ink-muted" />
          {t("listingHeader.sortBy")}
          <span className="text-brand">{SORT_LABELS[sort]}</span>
          <span className={["transition-transform", open ? "rotate-180" : ""].join(" ")}>
            <ChevronIcon size={14} className="text-ink-muted" />
          </span>
        </button>

        {open && (
          <div className="absolute right-0 top-[52px] z-20 w-[200px] rounded-xl border border-line bg-white p-1 shadow-lg">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onSortChange(k);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px]",
                  k === sort
                    ? "bg-brand-50 font-bold text-brand"
                    : "font-medium text-ink hover:bg-surface-soft",
                ].join(" ")}
              >
                {SORT_LABELS[k]}
                {k === sort && (
                  <span className="text-[10px] font-extrabold uppercase tracking-wide">
                    {t("listingHeader.sortOn")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[14px] font-bold text-ink">
          <ClockIcon size={16} className="text-ink-muted" />
          {t("listingHeader.anyTime")}
          <span className="rotate-180">
            <ChevronIcon size={14} className="text-ink-muted" />
          </span>
        </div>
      </div>
    </div>
  );
}
