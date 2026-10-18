"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronIcon, EyeIcon } from "@/components/icons";
import { useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Labeled text/email/password input used by the partner auth forms.
 *
 * We don't pull in a heavy form library — this app uses simple native
 * `<form>` elements driven by `useState` (see PartnerLoginForm /
 * PartnerRegisterForm). This component centralizes:
 *   - the Figma-spec 1.5px border / 12px radius
 *   - the 16px font-size label & 14px input text
 *   - the focus ring brand colour
 *   - error-state red border (driven by the parent via `aria-invalid`)
 *
 * `forwardRef` lets a parent `<form>` call `e.currentTarget.reset()`
 * or focus the input via a ref hook without extra ceremony.
 */
type FieldProps = {
  label: string;
  error?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const PartnerField = forwardRef<HTMLInputElement, FieldProps>(
  function PartnerField(
    { label, error, type = "text", id: providedId, ...rest },
    ref,
  ) {
    // Stable id for label/input pairing without callers having to thread
    // one through. Falls back to a generated id when not provided so the
    // control remains usable if rendered without a label `htmlFor`.
    const autoId = useId();
    const id = providedId ?? `pf-${autoId}`;
    const errorId = error ? `${id}-error` : undefined;

    return (
      <div className="flex w-full flex-col gap-2">
        <label
          htmlFor={id}
          className="text-[14px] font-semibold text-ink leading-none"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          type={type}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
          className={
            "h-[44px] w-full rounded-xl border bg-white px-4 text-[14px] font-normal text-ink outline-none transition-colors placeholder:text-ink-muted " +
            (error
              ? "border-rose-500 focus:border-rose-500"
              : "border-line focus:border-brand")
          }
          {...rest}
        />
        {error ? (
          <span id={errorId} className="text-[12px] font-normal text-rose-500">
            {error}
          </span>
        ) : null}
      </div>
    );
  },
);

/**
 * Primary CTA button used on the partner auth forms.
 *
 * Figma spec: brand-red `#ff4d30`, white text, 18px weight 600,
 * full-width, 12px radius, 16px vertical padding.
 */
export function PartnerSubmitButton({
  children,
  pending,
}: {
  children: React.ReactNode;
  /** When true, disables the button + swaps label to "..." so the form
   *  can't be double-submitted while the (mock) auth round-trip runs. */
  pending?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-[52px] w-full rounded-xl bg-brand text-[18px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t("partner.common.pleaseWait") : children}
    </button>
  );
}
/**
 * Password input with show/hide eye toggle (Figma `imgEye`).
 *
 * Owns a local `visible` state so each input toggles independently
 * (relevant when a future "confirm password" field is added on the
 * Register screen — both need their own eye state).
 */
export function PartnerPasswordField({
  label,
  error,
  id: providedId,
  ...rest
}: Omit<FieldProps, "type">) {
  const t = useT();
  const autoId = useId();
  const id = providedId ?? `pf-${autoId}`;
  const errorId = error ? `${id}-error` : undefined;
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex w-full flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[14px] font-semibold text-ink leading-none"
      >
        {label}
      </label>
      <div
        className={
          "relative flex h-[44px] w-full items-center rounded-xl border bg-white transition-colors " +
          (error
            ? "border-rose-500 focus-within:border-rose-500"
            : "border-line focus-within:border-brand")
        }
      >
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
          className="h-full w-full rounded-xl bg-transparent px-4 pr-11 text-[14px] font-normal text-ink outline-none placeholder:text-ink-muted"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("partner.common.hidePassword") : t("partner.common.showPassword")}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:text-ink"
        >
          <EyeIcon size={18} masked={!visible} />
        </button>
      </div>
      {error ? (
        <span id={errorId} className="text-[12px] font-normal text-rose-500">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Native-styled `<select>` matching the Figma input field spec
 * (1px `#e5e7eb` border, 12px radius, 14px placeholder text).
 *
 * Uses a chevron overlay rather than the native dropdown chevron so
 * styling stays consistent on all browsers. The native element is kept
 * intact for accessibility + keyboard navigation + native mobile
 * pickers.
 */
type SelectFieldProps = {
  label: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function PartnerSelect({
  label,
  error,
  options,
  placeholder,
  id: providedId,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const id = providedId ?? `pf-${autoId}`;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex w-full flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[14px] font-semibold text-ink leading-none"
      >
        {label}
      </label>
      <div
        className={
          "relative flex h-[44px] w-full items-center rounded-xl border bg-white transition-colors " +
          (error
            ? "border-rose-500 focus-within:border-rose-500"
            : "border-line focus-within:border-brand")
        }
      >
        <select
          id={id}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
          defaultValue=""
          className="h-full w-full appearance-none rounded-xl bg-transparent px-4 pr-10 text-[14px] font-normal text-ink outline-none"
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronIcon
          size={14}
          className="pointer-events-none absolute right-4 text-ink-muted"
        />
      </div>
      {error ? (
        <span id={errorId} className="text-[12px] font-normal text-rose-500">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Multi-line text input used for the restaurant address on the
 * Register screen.
 */
type TextareaFieldProps = {
  label: string;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function PartnerTextarea({
  label,
  error,
  id: providedId,
  ...rest
}: TextareaFieldProps) {
  const autoId = useId();
  const id = providedId ?? `pf-${autoId}`;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex w-full flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[14px] font-semibold text-ink leading-none"
      >
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={errorId}
        rows={3}
        className={
          "min-h-[80px] w-full rounded-xl border bg-white px-4 py-3 text-[14px] font-normal text-ink outline-none transition-colors placeholder:text-ink-muted resize-none " +
          (error
            ? "border-rose-500 focus:border-rose-500"
            : "border-line focus:border-brand")
        }
        {...rest}
      />
      {error ? (
        <span id={errorId} className="text-[12px] font-normal text-rose-500">
          {error}
        </span>
      ) : null}
    </div>
  );
}
