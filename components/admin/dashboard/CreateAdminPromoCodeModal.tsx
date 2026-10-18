"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

/**
 * কাজ ৫ — Admin "Create Promo Code" modal.
 *
 * Opens from a button in the AdminPromoCodesPage header; posts to
 * `POST /api/admin/promo-codes`. The endpoint enforces
 *   • role = ADMIN
 *   • `restaurantId = null` server-side (platform-wide only)
 *   • `createdByPartner = false`
 *   • standard code-format / discount validation
 * so the form here only has to collect the user-facing fields and
 * send them verbatim. Validation errors surface inline so the
 * admin can fix the offending field without losing what they've
 * already typed.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (created: CreatedCode) => void;
};

export type CreatedCode = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  createdByPartner: boolean;
  createdAt: string;
  restaurantId: string | null;
  imageUrl: string | null;
  description: string | null;
};

type FormState = {
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string; // keep as string for input ergonomics
  minOrderAmount: string;
  maxDiscount: string;
  expiresAt: string;
  usageLimit: string;
  description: string;
};

const EMPTY: FormState = {
  code: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  minOrderAmount: "",
  maxDiscount: "",
  expiresAt: "",
  usageLimit: "",
  description: "",
};

export function CreateAdminPromoCodeModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the modal opens, so a previous draft doesn't
  // bleed into the next attempt.
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      // Build the payload. Empty strings → undefined so the server
      // treats them as "not set" rather than rejecting them with
      // type-mismatch errors.
      const body: Record<string, unknown> = {
        code: form.code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
      };
      if (form.minOrderAmount.trim() !== "")
        body.minOrderAmount = Number(form.minOrderAmount);
      if (form.maxDiscount.trim() !== "")
        body.maxDiscount = Number(form.maxDiscount);
      if (form.expiresAt.trim() !== "") {
        // The datetime-local input doesn't carry a timezone; the
        // server treats it as UTC midnight. Convert to an ISO
        // string so the timezone is unambiguous.
        body.expiresAt = new Date(form.expiresAt).toISOString();
      }
      if (form.usageLimit.trim() !== "")
        body.usageLimit = Number(form.usageLimit);
      if (form.description.trim() !== "")
        body.description = form.description.trim();

      const res = await apiFetch<{ code: CreatedCode }>(
        "/api/admin/promo-codes",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        setError(res.error.message);
        setSubmitting(false);
        return;
      }
      onCreated(res.data.code);
      onClose();
    },
    [form, submitting, onClose, onCreated],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-promo-title"
      data-create-admin-promo-modal="true"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="flex w-full max-w-[560px] flex-col gap-5 rounded-3xl border border-line bg-white p-6 shadow-xl"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2
              id="create-promo-title"
              className="font-display text-[20px] font-extrabold leading-tight text-ink"
            >
              Create promo code
            </h2>
            <p className="text-[12px] text-ink-muted">
              Platform-wide code — applies on any restaurant&apos;s items.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
          >
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Code"
            required
            helper="Uppercase letters, numbers, dashes. 2-32 chars."
          >
            <input
              type="text"
              required
              value={form.code}
              onChange={(e) =>
                setForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))
              }
              data-field="code"
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] font-semibold text-ink outline-none focus:border-brand"
              placeholder="WELCOME50"
            />
          </Field>

          <Field label="Description (optional)">
            <input
              type="text"
              maxLength={200}
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand"
              placeholder="Free delivery on first order"
            />
          </Field>

          <Field label="Discount type" required>
            <select
              value={form.discountType}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  discountType: e.target.value as FormState["discountType"],
                }))
              }
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand"
            >
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="FIXED">Fixed (৳)</option>
            </select>
          </Field>

          <Field
            label={
              form.discountType === "PERCENTAGE" ? "Discount %" : "Discount ৳"
            }
            required
          >
            <input
              type="number"
              required
              min={1}
              max={form.discountType === "PERCENTAGE" ? 100 : undefined}
              step={1}
              value={form.discountValue}
              onChange={(e) =>
                setForm((s) => ({ ...s, discountValue: e.target.value }))
              }
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand"
              placeholder={form.discountType === "PERCENTAGE" ? "20" : "50"}
            />
          </Field>

          <Field label="Min order amount (optional)">
            <input
              type="number"
              min={0}
              step={1}
              value={form.minOrderAmount}
              onChange={(e) =>
                setForm((s) => ({ ...s, minOrderAmount: e.target.value }))
              }
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand"
              placeholder="200"
            />
          </Field>

          <Field
            label="Max discount (optional)"
            helper={
              form.discountType === "FIXED"
                ? "Not used for FIXED codes"
                : undefined
            }
          >
            <input
              type="number"
              min={1}
              step={1}
              value={form.maxDiscount}
              onChange={(e) =>
                setForm((s) => ({ ...s, maxDiscount: e.target.value }))
              }
              disabled={form.discountType === "FIXED"}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand disabled:bg-surface disabled:text-ink-muted"
              placeholder="100"
            />
          </Field>

          <Field label="Usage limit (optional)" helper="Empty = unlimited">
            <input
              type="number"
              min={1}
              step={1}
              value={form.usageLimit}
              onChange={(e) =>
                setForm((s) => ({ ...s, usageLimit: e.target.value }))
              }
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand"
              placeholder="1000"
            />
          </Field>

          <Field label="Expires at (optional)" helper="Empty = never">
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) =>
                setForm((s) => ({ ...s, expiresAt: e.target.value }))
              }
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-brand"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-11 rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            data-action="create-admin-promo-submit"
            className="h-11 rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create promo code"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  helper,
  required,
  children,
}: {
  label: string;
  helper?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {helper ? (
        <span className="text-[11px] text-ink-muted">{helper}</span>
      ) : null}
    </label>
  );
}