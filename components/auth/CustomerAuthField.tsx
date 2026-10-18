"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
} from "react";
import { EyeIcon } from "@/components/icons";

/**
 * Field primitives for the customer /login and /register pages.
 *
 * Visually match the rest of the customer checkout flow: 1px
 * `#e5e7eb` border, 12px radius, 14px text, brand-red focus ring.
 * Field-level error messages render in red below the input.
 */

type CommonFieldProps = {
  label: string;
  error?: string;
  placeholder?: string;
};

type FieldProps = CommonFieldProps & InputHTMLAttributes<HTMLInputElement>;

/** Plain text / email / phone input. */
export const CustomerAuthField = forwardRef<HTMLInputElement, FieldProps>(
  function CustomerAuthField(
    { label, error, id: providedId, className, ...rest },
    ref,
  ) {
    const autoId = useId();
    const id = providedId ?? `caf-${autoId}`;
    const errorId = error ? `${id}-error` : undefined;
    return (
      <div className="flex w-full flex-col gap-2">
        <label htmlFor={id} className="text-[14px] font-semibold text-ink leading-none">
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

/**
 * Password input with show/hide eye toggle. Each instance owns its own
 * visibility state so multi-password forms (login + register-confirm)
 * toggle independently.
 */
type PasswordFieldProps = CommonFieldProps & {
  trailing?: React.ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const CustomerAuthPasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function CustomerAuthPasswordField(
    { label, error, id: providedId, className, trailing, ...rest },
    ref,
  ) {
    const autoId = useId();
    const id = providedId ?? `caf-${autoId}`;
    const errorId = error ? `${id}-error` : undefined;
    const [visible, setVisible] = useState(false);

    return (
      <div className="flex w-full flex-col gap-2">
        <label htmlFor={id} className="text-[14px] font-semibold text-ink leading-none">
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
          <input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={errorId}
            className={
              "h-full w-full rounded-xl bg-transparent px-4 pr-12 text-[14px] font-normal text-ink outline-none placeholder:text-ink-muted " +
              (className ?? "")
            }
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:text-ink"
          >
            <EyeIcon size={18} masked={!visible} />
          </button>
        </div>
        {trailing}
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
 * Primary CTA — same brand-red button language as the homepage checkout
 * CTA and the partner-login submit. h-12, 12px radius, 14-16px label,
 * white text, slight hover fade.
 */
export function CustomerAuthSubmitButton({
  children,
  pending,
}: {
  children: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-xl bg-brand text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
