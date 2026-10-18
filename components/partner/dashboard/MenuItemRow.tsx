"use client";

import Image from "next/image";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { ToggleSwitch } from "@/components/partner/dashboard/ToggleSwitch";
import {
  categoryLabelKey,
  type MenuItem,
} from "@/data/menu-management";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * One row in the menu-items grid.
 */
export function MenuItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  onToggle: (id: string, next: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const catKey = categoryLabelKey(item.category);
  const categoryLabel = catKey ? t(catKey as Parameters<typeof t>[0]) : item.category;
  return (
    <article
      data-item-id={item.id}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 md:flex-row md:items-center md:justify-between"
    >
      {/* Left: image + description */}
      <div className="flex flex-1 min-w-0 items-start gap-4">
        <div className="relative h-[90px] w-[90px] shrink-0 overflow-hidden rounded-xl bg-surface">
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="90px"
            className="object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[16px] font-extrabold text-ink">
              {item.name}
            </h3>
            <span className="font-display text-[16px] font-extrabold text-brand shrink-0">
              {item.price}
            </span>
          </div>
          <p className="text-[12px] text-ink-muted line-clamp-2">
            {item.description}
          </p>
          <span className="mt-1 inline-flex w-fit items-center rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
            {categoryLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <ToggleSwitch
            on={item.available}
            onChange={(next) => onToggle(item.id, next)}
            ariaLabel={item.available ? t("partner.menu.available") : t("partner.menu.unavailable")}
          />
          <span className="text-[12px] font-semibold text-ink-muted">
            {item.available ? t("partner.menu.available") : t("partner.menu.unavailable")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(item.id)}
            aria-label={t("partner.common.edit")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink-muted hover:text-ink"
          >
            <PencilIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label={t("partner.common.delete")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-rose-500 hover:bg-rose-50"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}