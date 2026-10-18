"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { ChevronIcon, EyeIcon, UploadCloudIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Labeled form fields for the Rider auth flow (login + register).
 *
 * Mirrors the Figma design system shared with PartnerField (1.5px
 * border, 12px radius, 14px ink label, 14px input text, brand-red
 * focus border, rose-500 error border) but kept in its own file so
 * the Rider flow can evolve independently without forking the
 * partner source.
 *
 * Exports:
 *   • RiderField         — single-line text/email/tel input.
 *   • RiderPasswordField — password with show/hide eye toggle.
 *   • RiderSelect        — native select with chevron overlay.
 *   • RiderFileField     — file-upload drop zone (placeholder UI,
 *                          no real upload — the user spec called
 *                          this out as "no further work needed").
 *   • RiderSubmitButton  — primary brand-red CTA.
 */

type FieldProps = {
  label: string;
  error?: string;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/* -------------------------------------------------------------------------- */
/*  Text input                                                                */
/* -------------------------------------------------------------------------- */

export const RiderField = forwardRef<HTMLInputElement, FieldProps>(
  function RiderField(
    { label, error, type = "text", id: providedId, className, ...rest },
    ref,
  ) {
    const autoId = useId();
    const id = providedId ?? `rf-${autoId}`;
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
              : "border-line focus:border-brand") +
            (className ? " " + className : "")
          }
          {...rest}
        />
        {error ? (
          <span
            id={errorId}
            className="text-[12px] font-normal text-rose-500"
          >
            {error}
          </span>
        ) : null}
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */
/*  Password input                                                            */
/* -------------------------------------------------------------------------- */

export function RiderPasswordField({
  label,
  error,
  id: providedId,
  ...rest
}: Omit<FieldProps, "type">) {
  const autoId = useId();
  const id = providedId ?? `rf-${autoId}`;
  const errorId = error ? `${id}-error` : undefined;
  const [visible, setVisible] = useState(false);
  const t = useT();

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
          aria-label={visible ? t("rider.common.hidePassword") : t("rider.common.showPassword")}
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

/* -------------------------------------------------------------------------- */
/*  Select (vehicle type)                                                     */
/* -------------------------------------------------------------------------- */

type SelectFieldProps = {
  label: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function RiderSelect({
  label,
  error,
  options,
  placeholder,
  id: providedId,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const id = providedId ?? `rf-${autoId}`;
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

/* -------------------------------------------------------------------------- */
/*  File upload (placeholder UI)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Document-upload zone for the Register screen's license/NID field.
 *
 * Per the user spec this is placeholder-only ("placeholder-only, no further work"):
 *   • The `<input type="file">` is hidden (sr-only) but real, so it
 *     can be re-wired to a real upload later without touching the
 *     form layout.
 *   • The visible dropzone is a `<label>` so clicking anywhere on it
 *     opens the native file picker.
 *   • Once a file is selected, the filename is shown so the form
 *     demonstrates end-to-end UX without a backend.
 */
/**
 * Bug 2 — this used to type `file: File | null` and the parent
 * form stored the raw `File` object, which (a) can't be sent over
 * JSON, and (b) can't survive a re-render without losing the
 * reference. Now the field reads the file via FileReader on the
 * spot and hands the parent a `RiderDocFile` (dataUrl-based) —
 * the same shape the API expects.
 */
type RiderDocFile = {
  name: string;
  size: number;
  mime: string;
  dataUrl: string;
};

export function RiderFileField({
  label,
  error,
  file,
  onFileChange,
  // Vercel caps the serverless request body at 4.5 MB. The rider
  // license / NID upload is sent as a base64 data URL inside the
  // JSON body, so we cap the raw file at 3 MB to leave room for
  // the rest of the payload. Images are also compressed in the
  // browser before upload (see `lib/clientImage.ts`).
  hint = "PDF, JPG or PNG · max 3MB",
}: {
  label: string;
  error?: string;
  file: RiderDocFile | null;
  onFileChange: (file: RiderDocFile | null) => void;
  hint?: string;
}) {
  const autoId = useId();
  const id = `rf-${autoId}`;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[14px] font-semibold text-ink leading-none"
      >
        {label}
      </label>
      <label
        htmlFor={id}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white px-4 py-6 text-center transition-colors hover:bg-surface " +
          (error
            ? "border-rose-500"
            : file
              ? "border-brand"
              : "border-line")
        }
      >
        <input
          id={id}
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) {
              onFileChange(null);
              return;
            }
            // Read the file as a base64 data URL so the value can
            // ride along in the JSON register POST and be persisted
            // as `RiderDocument.fileUrl` server-side.
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              if (typeof result !== "string") {
                onFileChange(null);
                return;
              }
              onFileChange({
                name: f.name,
                size: f.size,
                mime: f.type || "application/octet-stream",
                dataUrl: result,
              });
            };
            reader.onerror = () => onFileChange(null);
            reader.readAsDataURL(f);
          }}
        />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff5f3] text-brand">
          <UploadCloudIcon size={16} />
        </span>
        <span className="text-[14px] font-semibold text-ink">
          {file ? file.name : "Click to upload or drag and drop"}
        </span>
        <span className="text-[12px] font-normal text-ink-muted">{hint}</span>
      </label>
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

export function RiderSubmitButton({
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
      className="h-[52px] w-full rounded-xl bg-brand text-[18px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
