"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "@/components/icons";
import { ToggleSwitch } from "@/components/partner/dashboard/ToggleSwitch";
import { MenuItemOptionsEditor } from "@/components/partner/dashboard/MenuItemOptionsEditor";
import {
  PartnerField,
  PartnerSelect,
  PartnerSubmitButton,
  PartnerTextarea,
} from "@/components/partner/PartnerField";
import {
  CUSTOM_CATEGORY_SENTINEL,
  isKnownCategory,
  menuCategories,
  type MenuItem,
} from "@/data/menu-management";
import { MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_BYTES_MB } from "@/lib/upload-limits";
import { prepareImageForUpload } from "@/lib/clientImage";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Add / Edit modal for menu items.
 *
 * Spec (mirrors Figma `add-item-panel`):
 *   • Modal overlay on the existing page (semi-transparent dark layer
 *     + centred white card with the Figma's 20px-radius, 24px-padding
 *     panel layout).
 *   • Heading + horizontal divider + 4 fields + photo uploader +
 *     Save/Cancel button row.
 *
 * Behaviour:
 *   • `mode="create"` opens with empty fields.
 *   • `mode="edit"` pre-fills with the row's data; submit replaces
 *     the existing item.
 *   • Validation: name required, price required + numeric, category
 *     required, description optional.
 *   • Photo upload reads the picked file via FileReader (data-URL);
 *     the URL is what gets saved — no real upload server needed for
 *     the demo.
 *
 * Category dropdown supports a "+ Add custom category" sentinel at
 * the bottom. Picking it swaps the <select> for a free-text input so
 * the partner can introduce categories that aren't in our default
 * list ("Bengali Specials", "Chef's Pick", …). The custom value is
 * persisted verbatim because `MenuItem.category` is a free-text
 * `String` column on the Prisma model.
 *
 * The modal owns its own form state but the parent page owns the
 * item-list state; we hand a fully-formed `MenuItem` (or `{ id,
 * ...patch }`) up via `onSubmit`.
 */
export function MenuItemModal({
  open,
  mode,
  initialItem,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialItem?: MenuItem;
  onSubmit: (item: MenuItem) => void;
  onClose: () => void;
}) {
  // The dropdown echoes two distinct values: either a known slug
  // ("rice-biryani") or the custom sentinel ("__custom__"). We
  // separately hold the typed custom text so switching back and forth
  // doesn't lose what the partner typed.
  const t = useT();
  const [form, setForm] = useState<MenuItem>(initialItem ?? emptyItem());
  const [customCategory, setCustomCategory] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const next = initialItem ?? emptyItem();
      setForm(next);
      // Pre-seed the custom text box only when the stored category
      // isn't one of the defaults. This is what lets the partner
      // re-open the modal and continue editing their custom category.
      setCustomCategory(
        next.category && !isKnownCategory(next.category) ? next.category : "",
      );
      setErrors({});
    }
  }, [open, initialItem]);

  // Close on Escape — accessible default for modal dialogs.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // The <select>'s value is either a known slug, the custom
  // sentinel, or the empty placeholder. If the partner picked an
  // existing item with a custom value, we surface it as the custom
  // option too so the input shows.
  const selectValue = (() => {
    if (!form.category) return "";
    if (isKnownCategory(form.category)) return form.category;
    return CUSTOM_CATEGORY_SENTINEL;
  })();

  const isCustom = selectValue === CUSTOM_CATEGORY_SENTINEL;

  function handleCategoryChange(value: string) {
    if (value === CUSTOM_CATEGORY_SENTINEL) {
      // Mark the form as "in custom mode" but keep the existing
      // category value until the partner types something in the
      // dedicated input. That way an accidental click on the
      // sentinel doesn't immediately wipe the row.
      setForm((f) => ({ ...f, category: CUSTOM_CATEGORY_SENTINEL }));
      setErrors((prev) => {
        const { category: _drop, ...rest } = prev;
        return rest;
      });
      return;
    }
    setForm((f) => ({ ...f, category: value }));
    setErrors((prev) => {
      const { category: _drop, ...rest } = prev;
      return rest;
    });
  }

  function handleCustomCategoryChange(value: string) {
    setCustomCategory(value);
    // Mirror the typed value into `form.category` so the submit
    // handler doesn't need a special case — what the partner sees
    // in the text input is exactly what gets persisted.
    setForm((f) => ({ ...f, category: value }));
    if (value.trim()) {
      setErrors((prev) => {
        const { category: _drop, ...rest } = prev;
        return rest;
      });
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t("partner.menu.form.errors.nameRequired");
    if (!form.price.trim()) next.price = t("partner.menu.form.errors.priceRequired");
    else if (!/^[0-9৳\s.,-]+$/.test(form.price))
      next.price = t("partner.menu.form.errors.priceInvalid");

    // Category is valid when:
    //   - it matches a known slug, OR
    //   - the partner is in custom mode and has typed a real value
    if (!form.category || form.category === CUSTOM_CATEGORY_SENTINEL) {
      next.category = t("partner.menu.form.errors.categoryRequired");
    } else if (
      form.category === CUSTOM_CATEGORY_SENTINEL ||
      !form.category.trim()
    ) {
      next.category = "Category can't be empty.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({ ...form, name: form.name.trim(), price: form.price.trim() });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-item-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        // Click-outside-to-close — but only when the overlay itself is
        // clicked, not the inner card.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-white p-6 flex flex-col gap-5 shadow-xl">
        <header className="flex flex-col gap-1">
          <h2
            id="menu-item-modal-title"
            className="font-display text-[22px] font-extrabold text-ink"
          >
            {mode === "create" ? t("partner.menu.form.createTitle") : t("partner.menu.form.editTitle")}
          </h2>
          <p className="text-[13px] text-ink-muted">
            {mode === "create" ? "—" : "—"}
          </p>
        </header>

        <div className="h-px w-full bg-line" aria-hidden />

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5"
        >
          <PartnerField
            name="name"
            label={t("partner.menu.form.itemName")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t("partner.menu.form.itemNamePlaceholder")}
            error={errors.name}
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <PartnerField
              name="price"
              label={t("partner.menu.form.price")}
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: e.target.value }))
              }
              placeholder={t("partner.menu.form.pricePlaceholder")}
              error={errors.price}
            />
            <PartnerSelect
              name="category"
              label={t("partner.menu.form.category")}
              value={selectValue}
              onChange={(e) => handleCategoryChange(e.target.value)}
              options={[
                { value: "", label: t("partner.menu.form.categoryPlaceholder") },
                ...menuCategories.map((c) => ({
                  value: c.key,
                  label: t(c.labelKey as Parameters<typeof t>[0]),
                })),
                { value: CUSTOM_CATEGORY_SENTINEL, label: "+ Add custom category" },
              ]}
              error={errors.category}
            />
          </div>

          {isCustom ? (
            <PartnerField
              name="customCategory"
              label={t("partner.menu.form.optionGroup.name")}
              value={customCategory}
              onChange={(e) => handleCustomCategoryChange(e.target.value)}
              placeholder={t("partner.menu.form.optionGroup.namePlaceholder")}
              error={errors.category}
            />
          ) : null}

          <PartnerTextarea
            name="description"
            label={t("partner.menu.form.description")}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder={t("partner.menu.form.descriptionPlaceholder")}
          />

          <PhotoUploader
            image={form.image}
            onChange={(src) => setForm((f) => ({ ...f, image: src }))}
          />

          <MenuItemOptionsEditor
            options={form.options ?? []}
            onChange={(next) =>
              setForm((f) => ({ ...f, options: next }))
            }
          />

          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-ink">
                {t("partner.menu.form.available")}
              </span>
              <span className="text-[12px] text-ink-muted">
                {t("partner.menu.form.popularHelp")}
              </span>
            </div>
            <ToggleSwitch
              on={form.available}
              onChange={(next) =>
                setForm((f) => ({ ...f, available: next }))
              }
              ariaLabel={t("partner.menu.form.available")}
            />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-12 w-full rounded-xl border border-line bg-white text-[14px] font-semibold text-ink hover:bg-surface md:w-auto md:px-6"
            >
              {t("partner.common.cancel")}
            </button>
            <div className="w-full md:w-auto">
              <PartnerSubmitButton>
                {mode === "create" ? t("partner.menu.form.saveItem") : t("partner.common.saveChanges")}
              </PartnerSubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Blank-item factory so the modal has stable initial state. */
function emptyItem(): MenuItem {
  return {
    id: "",
    name: "",
    price: "",
    description: "",
    category: "mains",
    image: "",
    available: true,
  };
}

/**
 * Photo uploader — a dropzone-style card with a hidden <input type=file>.
 * The picked file is read as a data URL so it can be rendered inline
 * without a backend upload. If the user has no image, the upload card
 * shows the Figma image glyph + "click to upload" copy.
 */
function PhotoUploader({
  image,
  onChange,
}: {
  image: string;
  onChange: (src: string) => void;
}) {
  const t = useT();
  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      // Always run through the canvas compressor so a 5 MB phone
      // photo lands well under the 1 MB cap and inside Vercel's
      // 4.5 MB body limit.
      const dataUrl = await prepareImageForUpload(file);
      if (dataUrl.length > MAX_MENU_IMAGE_BYTES) {
        window.alert(
          `Image is still too large after compression (max ${MAX_MENU_IMAGE_BYTES_MB} MB). Try a smaller file.`,
        );
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : `Image is too large. Try a smaller file.`,
      );
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <label className="text-[14px] font-semibold text-ink leading-none">
        {t("partner.menu.form.photo")}
      </label>
      <label
        className={
          "flex min-h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed bg-white px-4 py-4 text-center transition-colors " +
          (image ? "border-brand" : "border-line hover:border-brand")
        }
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt="Selected menu item preview"
            className="h-20 w-20 rounded-lg object-cover"
          />
        ) : (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffebe8] text-brand">
              <ImageIcon size={20} />
            </span>
            <span className="text-[13px] font-semibold text-ink">
              {t("partner.menu.form.photo")}
            </span>
            <span className="text-[12px] text-ink-muted">
              {t("partner.menu.form.photoHelp")}
            </span>
          </>
        )}
      </label>
    </div>
  );
}
