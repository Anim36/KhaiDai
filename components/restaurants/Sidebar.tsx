"use client";

import { CheckIcon, SearchSmallIcon, SlidersIcon } from "@/components/icons";
import {
  cuisineOptions,
  ratingOptions,
  priceOptions,
  deliveryOptions,
  offerOptions,
  type CuisineId,
  type DeliveryId,
  type OfferId,
  type PriceId,
  type RatingId,
} from "@/data/restaurants";
import { useT } from "@/lib/i18n/LocaleProvider";

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-[15px] font-extrabold text-ink">
        {title}
      </h3>
      {children}
    </div>
  );
}

type CheckRowProps = {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  onToggle: () => void;
};

function CheckRow({ id, label, count, checked, onToggle }: CheckRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer select-none items-center gap-2.5 py-1.5"
    >
      <span
        className={[
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded",
          "border transition-colors",
          checked
            ? "border-brand bg-brand text-white"
            : "border-line bg-white text-transparent",
        ].join(" ")}
      >
        <CheckIcon size={10} />
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="sr-only"
      />
      <span className="flex-1 text-[14px] font-medium text-ink">{label}</span>
      {typeof count === "number" && (
        <span className="text-[12px] font-medium text-ink-muted">({count})</span>
      )}
    </label>
  );
}

export type FilterState = {
  cuisines: Set<CuisineId>;
  ratings: Set<RatingId>;
  prices: Set<PriceId>;
  delivery: Set<DeliveryId>;
  offers: Set<OfferId>;
  query: string;
};

type Props = {
  state: FilterState;
  onChange: (next: FilterState) => void;
  /**
   * Optional cuisines pulled from the currently-loaded restaurant
   * list. When supplied, the sidebar renders these chips instead of
   * the closed `cuisineOptions` seed, so partner-added cuisines
   * ("Bengali Specials", "Chef's Pick", …) become filterable
   * without a code change. Falls back to `cuisineOptions` while the
   * listing is loading.
   */
  availableCuisines?: string[];
};

export function Sidebar({ state, onChange, availableCuisines }: Props) {
  const t = useT();
  // Merge the seed list with the dynamic ones so a partner who
  // chooses a default cuisine still sees it. De-duplicated by
  // case-insensitive comparison so "Bengali" and "bengali" don't
  // both appear.
  const cuisineChips = (() => {
    if (!availableCuisines || availableCuisines.length === 0) {
      return [...cuisineOptions];
    }
    const seen = new Map<string, string>();
    const add = (value: string) => {
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    };
    for (const c of cuisineOptions) add(c);
    for (const c of availableCuisines) add(c);
    return [...seen.values()];
  })();
  const toggle = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K] extends Set<infer V> ? V : never
  ) => {
    const next: FilterState = { ...state, [key]: new Set(state[key]) };
    const set = next[key] as Set<unknown>;
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange(next);
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-7 rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-[18px] font-extrabold text-ink">{t("sidebar.filtersTitle")}</h2>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
          <SearchSmallIcon size={16} className="text-ink-muted" />
          <input
            type="text"
            value={state.query}
            onChange={(e) => onChange({ ...state, query: e.target.value })}
            placeholder={t("sidebar.searchPlaceholder")}
            className="w-full bg-transparent text-[13px] font-normal text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </div>
      </div>

      <Section title={t("sidebar.sortBy")}>
        <div className="flex flex-col">
          {ratingOptions.map((opt) => (
            <CheckRow
              key={opt}
              id={`rating-${opt}`}
              label={opt}
              checked={state.ratings.has(opt)}
              onToggle={() => toggle("ratings", opt)}
            />
          ))}
        </div>
      </Section>

      <div className="h-px w-full bg-line" />

      <Section title={t("sidebar.offers")}>
        <div className="flex flex-col">
          {offerOptions.map((opt) => (
            <CheckRow
              key={opt}
              id={`offer-${opt}`}
              label={opt}
              checked={state.offers.has(opt)}
              onToggle={() => toggle("offers", opt)}
            />
          ))}
        </div>
      </Section>

      <div className="h-px w-full bg-line" />

      <Section title={t("sidebar.cuisine")}>
        <div className="flex flex-col">
          {cuisineChips.map((opt) => (
            <CheckRow
              key={opt}
              id={`cuisine-${opt}`}
              label={opt}
              checked={state.cuisines.has(opt)}
              onToggle={() => toggle("cuisines", opt)}
            />
          ))}
        </div>
      </Section>

      <div className="h-px w-full bg-line" />

      <Section title={t("sidebar.priceRange")}>
        <div className="flex flex-col">
          {priceOptions.map((opt) => (
            <CheckRow
              key={opt.id}
              id={`price-${opt.id}`}
              label={opt.label}
              checked={state.prices.has(opt.id)}
              onToggle={() => toggle("prices", opt.id)}
            />
          ))}
        </div>
      </Section>

      <div className="h-px w-full bg-line" />

      <Section title={t("sidebar.deliveryTime")}>
        <div className="flex flex-col">
          {deliveryOptions.map((opt) => (
            <CheckRow
              key={opt.id}
              id={`delivery-${opt.id}`}
              label={opt.label}
              checked={state.delivery.has(opt.id)}
              onToggle={() => toggle("delivery", opt.id)}
            />
          ))}
        </div>
      </Section>

      <button
        type="button"
        onClick={() =>
          onChange({
            cuisines: new Set(),
            ratings: new Set(),
            prices: new Set(),
            delivery: new Set(),
            offers: new Set(),
            query: "",
          })
        }
        className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-soft"
      >
        <SlidersIcon size={16} className="text-ink-muted" />
        {t("sidebar.resetFilters")}
      </button>
    </aside>
  );
}
