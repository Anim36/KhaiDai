"use client";

import Link from "next/link";
import {
  CakeSliceIcon,
  CircleXIcon,
  CookingPotIcon,
  HamburgerIcon,
  IceCreamBowlIcon,
  SaladIcon,
} from "@/components/icons";
import { categories } from "@/data/home";
import { useT } from "@/lib/i18n/LocaleProvider";

// Stable list of category ids — kept in sync with
// `messages/{en,bn}.json:home.categoriesItems.*`. We restrict to a
// literal type so a typo in `categories` triggers a TS error.
const KNOWN_CATEGORY_IDS = [
  "biryani",
  "burgers",
  "chinese",
  "sweets",
  "snacks",
  "healthy",
] as const;
type CategoryId = (typeof KNOWN_CATEGORY_IDS)[number];

function isCategoryId(v: string): v is CategoryId {
  return (KNOWN_CATEGORY_IDS as readonly string[]).includes(v);
}

function labelKeyFor(id: string): import("@/lib/i18n/LocaleProvider").TranslationKey {
  // The dot-path is generated at runtime; the literal union in
  // `TranslationKey` is satisfied because `home.categoriesItems.<id>`
  // exists in the dictionaries.
  return `home.categoriesItems.${id}` as import("@/lib/i18n/LocaleProvider").TranslationKey;
}

type IconRenderer = (p: { size?: number; className?: string }) => JSX.Element;

/**
 * Icon mapping mirrors the Figma frame exactly:
 *   Biryani         → ice-cream-bowl
 *   Burgers & Pizza → hamburger
 *   Chinese & Thai  → cooking-pot (32px)
 *   Sweets/Desserts → cake-slice
 *   Snacks          → circle-x
 *   Healthy Foods   → salad
 */
const ICON_MAP: Record<string, IconRenderer> = {
  "pot.svg": (p) => <IceCreamBowlIcon {...p} />,        // Figma: Biryani
  "pot2.svg": (p) => <CookingPotIcon {...p} />,          // Figma: Chinese & Thai
  "burger.svg": (p) => <HamburgerIcon {...p} />,         // Figma: Burgers & Pizza
  "cake.svg": (p) => <CakeSliceIcon {...p} />,           // Figma: Sweets & Desserts
  "snack.svg": (p) => <CircleXIcon {...p} />,            // Figma: Snacks
  "salad.svg": (p) => <SaladIcon {...p} />,              // Figma: Healthy Foods
};

const FALLBACK_ICON: IconRenderer = (p) => <CookingPotIcon {...p} />;

/**
 * "What's on your mind?" strip on the homepage.
 *
 * Renders one tile per `categories` entry from `@/data/home`. Each
 * tile points at `/restaurants?category=<stable id>` so the
 * restaurant listing can pre-select the matching cuisine chip —
 * using the stable `id` (not the localised label) keeps the URL
 * stable across languages.
 *
 * The display label resolves to `home.categoriesItems.<id>` so the
 * strip flips with the rest of the page when the user toggles
 * Bangla/English.
 */
export function CategoriesStrip() {
  const t = useT();

  return (
    <section className="flex w-full flex-col gap-5 bg-white px-4 py-8 sm:px-6 sm:py-10 lg:px-[64px]">
      <h2 className="font-display text-[20px] font-extrabold text-ink sm:text-[22px]">
        {t("home.categoriesHeading")}
      </h2>

      {/* Mobile: horizontal-scroll strip (snap, hide scrollbar).
          Desktop (md+): 6 across, justified, fixed 180px tiles. */}
      <div className="-mx-4 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-hide px-4 sm:gap-4 xl:mx-0 xl:w-full xl:justify-between xl:overflow-visible xl:px-0">
        {categories.map((cat) => {
          const Icon = ICON_MAP[cat.icon] ?? FALLBACK_ICON;
          // Use the stable id in the URL so /restaurants can filter
          // without caring about the current UI locale.
          const href = `/restaurants?category=${encodeURIComponent(cat.id)}`;
          // If the data file adds an id we don't have a translation
          // for yet, fall back to the static label so the chip
          // doesn't disappear.
          const label = isCategoryId(cat.id) ? t(labelKeyFor(cat.id)) : cat.label;
          return (
            <Link
              key={cat.id}
              href={href}
              className="flex w-[140px] shrink-0 snap-start flex-col items-center gap-3 rounded-2xl bg-surface-page p-3 hover:bg-brand-50 sm:w-[160px] sm:p-4 xl:w-[180px]"
            >
              <span className="flex items-center justify-center rounded-3xl bg-brand-100 p-3 text-brand">
                <Icon size={32} />
              </span>
              <span className="text-center text-[13px] font-bold text-ink sm:text-[15px]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}