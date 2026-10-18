"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Settings-form field primitives.
 *
 * Visual language mirrors the partner-auth fields but adds a
 * 14px-semibold ink label so the settings page reads as a
 * standalone form (not a copy of the auth page).
 */

type CommonFieldProps = {
  label: string;
  error?: string;
};

type TextFieldProps = CommonFieldProps &
  InputHTMLAttributes<HTMLInputElement>;
type TextareaFieldProps = CommonFieldProps &
  TextareaHTMLAttributes<HTMLTextAreaElement>;
type SelectFieldProps = CommonFieldProps & {
  options: Array<{ value: string; label: string }>;
} & SelectHTMLAttributes<HTMLSelectElement>;

/* -------------------------------------------------------------------------- */
/*  Text input                                                                */
/* -------------------------------------------------------------------------- */

export const SettingsTextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function SettingsTextField(
    { label, error, id: providedId, className, ...rest },
    ref,
  ) {
    const autoId = useId();
    const id = providedId ?? `set-${autoId}`;
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
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
          className={
            "h-12 w-full rounded-xl border bg-white px-4 text-[14px] font-normal text-ink outline-none transition-colors placeholder:text-ink-muted " +
            (error
              ? "border-rose-500 focus:border-rose-500"
              : "border-line focus:border-brand") +
            (className ? " " + className : "")
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

/* -------------------------------------------------------------------------- */
/*  Textarea                                                                  */
/* -------------------------------------------------------------------------- */

export const SettingsTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaFieldProps
>(function SettingsTextarea(
  { label, error, id: providedId, className, ...rest },
  ref,
) {
  const autoId = useId();
  const id = providedId ?? `set-${autoId}`;
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
        ref={ref}
        id={id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={errorId}
        rows={3}
        className={
          "min-h-[80px] w-full rounded-xl border bg-white px-4 py-3 text-[14px] font-normal text-ink outline-none transition-colors placeholder:text-ink-muted resize-none " +
          (error
            ? "border-rose-500 focus:border-rose-500"
            : "border-line focus:border-brand") +
          (className ? " " + className : "")
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
});

/* -------------------------------------------------------------------------- */
/*  Select (cuisine picker)                                                   */
/* -------------------------------------------------------------------------- */

export function SettingsSelect({
  label,
  error,
  options,
  id: providedId,
  className,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const id = providedId ?? `set-${autoId}`;
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
          "relative flex h-12 w-full items-center rounded-xl border bg-white transition-colors " +
          (error
            ? "border-rose-500 focus-within:border-rose-500"
            : "border-line focus-within:border-brand")
        }
      >
        <select
          id={id}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
          className={
            "h-full w-full appearance-none rounded-xl bg-transparent px-4 pr-10 text-[14px] font-normal text-ink outline-none " +
            (className ?? "")
          }
          {...rest}
        >
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

/* -------------------------------------------------------------------------- */
/*  Submit button                                                             */
/* -------------------------------------------------------------------------- */

export function SettingsSubmitButton({
  children,
  pending,
  disabled,
}: {
  children: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-12 w-full rounded-xl bg-brand px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 md:w-auto"
    >
      {pending ? t("partner.common.saving") : children}
    </button>
  );
}