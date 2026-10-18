"use client";

import {
  menuCategories,
  type MenuCategory,
} from "@/data/menu-management";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Category filter pills (Figma `category-tabs` frame, data-node-id 4:1943).
 *
 * Five pill buttons in a single horizontal row. Active pill uses the
 * brand-red background + white ExtraBold label; inactive pills use a
 * white background with a 1px `#e5e7eb` border + ink-muted Medium
 * label. All pills share 12px radius and 18/10px padding so the row
 * reads as one continuous segmented control.
 *
 * The active key is owned by the parent — this component only renders
 * the visual state and forwards clicks.
 */
export function CategoryTabs({
  activeKey,
  onSelect,
}: {
  activeKey: MenuCategory | "all";
  onSelect: (key: MenuCategory | "all") => void;
}) {
  const t = useT();
  return (
    <nav
      role="tablist"
      aria-label={t("partner.menu.title")}
      className="flex flex-wrap items-start gap-2 w-full"
    >
      <CategoryTab
        label={t("partner.menu.filterAll")}
        active={activeKey === "all"}
        onClick={() => onSelect("all")}
      />
      {menuCategories.map((cat) => (
        <CategoryTab
          key={cat.key}
          label={t(cat.labelKey as Parameters<typeof t>[0])}
          active={activeKey === cat.key}
          onClick={() => onSelect(cat.key)}
        />
      ))}
    </nav>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      type="button"
      className={
        "shrink-0 rounded-xl px-[18px] py-[10px] text-[11px] transition-colors " +
        (active
          ? "bg-brand font-extrabold text-white border border-transparent"
          : "bg-white font-medium text-ink-muted border border-line hover:text-ink")
      }
    >
      {label}
    </button>
  );
}