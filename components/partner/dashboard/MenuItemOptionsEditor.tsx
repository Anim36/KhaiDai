"use client";

/**
 * MenuItemOptionsEditor — Feat 1
 *
 * Inline editor for the option groups a partner attaches to a
 * menu item (e.g. "Size" → Small/Large, "Extra Toppings" →
 * Egg/Cheese). Each group is a `MenuItemOptionDraft`; each
 * choice is a `MenuItemOptionChoiceDraft`.
 *
 * Why a tiny self-contained component?
 *   • Keeps the Add/Edit modal's JSX readable (the modal
 *     already has 4 fields + photo + availability + buttons).
 *   • The editor's state is **lifted** to the parent so Save
 *     round-trips through the parent's `handleSubmit` without
 *     extra plumbing. The parent owns the `MenuItem.options[]`
 *     array and hands us a `onChange` callback.
 *
 * The draft is intentionally permissive (ids are optional).
 * On Save the API either creates new rows (no id) or updates
 * existing ones (id present) — see
 * `lib/menu-item-options.ts → applyOptionsToMenuItem`.
 */

import { useId } from "react";
import {
  type MenuItemOptionDraft,
  type MenuItemOptionChoiceDraft,
} from "@/data/menu-management";
import { useT } from "@/lib/i18n/LocaleProvider";

export function MenuItemOptionsEditor({
  options,
  onChange,
}: {
  options: MenuItemOptionDraft[];
  onChange: (next: MenuItemOptionDraft[]) => void;
}) {
  const t = useT();
  // Stable per-render suffix so labels don't collide.
  const scope = useId();

  function updateOption(idx: number, patch: Partial<MenuItemOptionDraft>) {
    const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    onChange(next);
  }

  function removeOption(idx: number) {
    onChange(options.filter((_, i) => i !== idx));
  }

  function addOption() {
    if (options.length >= 5) return;
    onChange([
      ...options,
      {
        // Negative-id counter to keep React keys stable for
        // unsaved rows.
        id: `__new__${options.length}-${Date.now()}`,
        name: "",
        type: "SINGLE_CHOICE",
        required: false,
        choices: [
          { label: "", priceDelta: 0 },
          { label: "", priceDelta: 0 },
        ],
      },
    ]);
  }

  function updateChoice(
    optIdx: number,
    choiceIdx: number,
    patch: Partial<MenuItemOptionChoiceDraft>,
  ) {
    const next = options.map((o, i) => {
      if (i !== optIdx) return o;
      return {
        ...o,
        choices: o.choices.map((c, j) => (j === choiceIdx ? { ...c, ...patch } : c)),
      };
    });
    onChange(next);
  }

  function addChoice(optIdx: number) {
    const next = options.map((o, i) => {
      if (i !== optIdx) return o;
      if (o.choices.length >= 10) return o;
      return { ...o, choices: [...o.choices, { label: "", priceDelta: 0 }] };
    });
    onChange(next);
  }

  function removeChoice(optIdx: number, choiceIdx: number) {
    const next = options.map((o, i) => {
      if (i !== optIdx) return o;
      return { ...o, choices: o.choices.filter((_, j) => j !== choiceIdx) };
    });
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-ink">{t("partner.menu.form.optionsHeading")}</span>
          <span className="text-[12px] text-ink-muted">
            {t("partner.menu.form.optionsHelp")}
          </span>
        </div>
        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= 5}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-[13px] font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {t("partner.menu.form.addGroup")}
        </button>
      </div>

      {options.length === 0 ? (
        <p className="text-[12px] text-ink-muted">
          {t("partner.menu.form.noOptions")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {options.map((o, optIdx) => (
            <li
              key={o.id ?? `__draft__${optIdx}`}
              className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3"
            >
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.4fr_auto_auto_auto] md:items-center">
                {/* Group name */}
                <input
                  aria-label={`Option group ${optIdx + 1} name`}
                  value={o.name}
                  onChange={(e) =>
                    updateOption(optIdx, { name: e.target.value })
                  }
                  placeholder="e.g. Size, Extra Toppings"
                  className="h-10 w-full rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-brand"
                />
                {/* Type radio / multi */}
                <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-line bg-white">
                  <button
                    type="button"
                    aria-pressed={o.type === "SINGLE_CHOICE"}
                    onClick={() =>
                      updateOption(optIdx, { type: "SINGLE_CHOICE" })
                    }
                    className={
                      "h-full px-3 text-[12px] font-semibold " +
                      (o.type === "SINGLE_CHOICE"
                        ? "bg-brand text-white"
                        : "text-ink hover:bg-surface")
                    }
                  >
                    {t("partner.menu.form.optionGroup.single")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={o.type === "MULTI_CHOICE"}
                    onClick={() =>
                      updateOption(optIdx, { type: "MULTI_CHOICE" })
                    }
                    className={
                      "h-full px-3 text-[12px] font-semibold " +
                      (o.type === "MULTI_CHOICE"
                        ? "bg-brand text-white"
                        : "text-ink hover:bg-surface")
                    }
                  >
                    {t("partner.menu.form.optionGroup.multi")}
                  </button>
                </div>
                {/* Required toggle */}
                <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    checked={o.required}
                    onChange={(e) =>
                      updateOption(optIdx, { required: e.target.checked })
                    }
                  />
                  <span className="font-semibold">{t("partner.menu.form.optionGroup.required")}</span>
                </label>
                {/* Delete group */}
                <button
                  type="button"
                  onClick={() => removeOption(optIdx)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-rose-600 hover:border-rose-300"
                >
                  {t("partner.menu.form.optionGroup.deleteGroup")}
                </button>
              </div>

              {/* Choices */}
              <ul className="flex flex-col gap-1.5">
                {o.choices.map((c, choiceIdx) => (
                  <li
                    key={
                      c.id ??
                      `__draft__${optIdx}-${choiceIdx}-${scope}`
                    }
                    className="grid grid-cols-[1.4fr_120px_auto] items-center gap-2"
                  >
                    <input
                      aria-label={`Choice ${choiceIdx + 1} label`}
                      value={c.label}
                      onChange={(e) =>
                        updateChoice(optIdx, choiceIdx, {
                          label: e.target.value,
                        })
                      }
                      placeholder="e.g. Large"
                      className="h-9 w-full rounded-lg border border-line bg-white px-3 text-[12px] outline-none focus:border-brand"
                    />
                    <div className="flex h-9 items-center overflow-hidden rounded-lg border border-line bg-white">
                      <span className="flex h-full items-center bg-surface px-2 text-[12px] font-semibold text-ink-muted">
                        ৳
                      </span>
                      <input
                        type="number"
                        aria-label={`Choice ${choiceIdx + 1} price delta`}
                        value={Number.isFinite(c.priceDelta) ? c.priceDelta : 0}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = raw === "" ? 0 : Number(raw);
                          updateChoice(optIdx, choiceIdx, {
                            priceDelta: Number.isFinite(n) ? Math.round(n) : 0,
                          });
                        }}
                        className="h-full w-full bg-white px-2 text-[12px] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeChoice(optIdx, choiceIdx)}
                      disabled={o.choices.length <= 1}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-2 text-[12px] font-semibold text-rose-600 hover:border-rose-300 disabled:opacity-50"
                      aria-label={`Remove choice ${choiceIdx + 1}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => addChoice(optIdx)}
                  disabled={o.choices.length >= 10}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-dashed border-line bg-white px-3 text-[12px] font-semibold text-ink-muted hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {t("partner.menu.form.addChoice")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}