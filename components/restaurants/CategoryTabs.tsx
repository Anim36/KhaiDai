"use client";

import type { MenuCategory } from "@/data/restaurant-detail";

type Props = {
  categories: MenuCategory[];
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Sticky tab strip rendered above the menu list. Each tab scrolls
 * its target category into view via `scrollIntoView({ behavior: 'smooth' })`
 * and updates the active state via `onSelect`.
 */
export function CategoryTabs({ categories, activeId, onSelect }: Props) {
  function jumpTo(id: string) {
    onSelect(id);
    if (typeof document === "undefined") return;
    const el = document.getElementById(`category-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="sticky top-20 z-20 -mx-1 flex w-full shrink-0 gap-3 border-b border-line bg-white pb-2">
      {categories.map((cat) => {
        const active = cat.id === activeId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => jumpTo(cat.id)}
            className={[
              "shrink-0 rounded-xl border px-5 py-2.5 text-[14px] font-bold transition-colors",
              active
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-ink hover:bg-surface-soft",
            ].join(" ")}
          >
            {cat.name}
          </button>
        );
      })}
    </nav>
  );
}
