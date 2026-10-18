"use client";

import { useState } from "react";
import { ChevronIcon } from "@/components/icons";
import type { FaqItem } from "@/data/rider-help";
import { useT, type TranslationKey } from "@/lib/i18n/LocaleProvider";

/**
 * Collapsible FAQ list. Only one item is open at a time so the
 * list reads as a focused accordion rather than a wall of
 * paragraphs.
 *
 * Each item is a `<button>` (not a `<details>`) so the open/close
 * state lives in React and we get consistent keyboard focus +
 * animation behaviour across browsers.
 *
 * FAQ items are looked up from `rider.help.faqItems` — the data
 * layer's `faqItems` array only carries stable keys so we can
 * resolve the localised question + answer at render time.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, idx) => {
        const open = item.id === openId;
        return (
          <li
            key={item.id}
            className="rounded-2xl border border-line bg-white"
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${item.id}-panel`}
              onClick={() => setOpenId(open ? null : item.id)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="font-display text-[15px] font-extrabold text-ink">
                {t(
                  `rider.help.faqItems.${idx}.question` as TranslationKey,
                )}
              </span>
              <span
                className={
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-muted transition-transform " +
                  (open ? "rotate-180" : "")
                }
                aria-hidden
              >
                <ChevronIcon size={14} />
              </span>
            </button>
            {open ? (
              <div
                id={`${item.id}-panel`}
                role="region"
                className="border-t border-line px-5 py-4 text-[14px] font-normal text-ink-muted leading-[1.6]"
              >
                {t(`rider.help.faqItems.${idx}.answer` as TranslationKey)}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
