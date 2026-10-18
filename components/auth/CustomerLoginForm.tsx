"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import {
  CustomerAuthField,
  CustomerAuthPasswordField,
  CustomerAuthSubmitButton,
} from "@/components/auth/CustomerAuthField";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * /login form — email + password.
 *
 * On submit:
 *   1. Client-side validation (non-empty, valid email, password >= 6).
 *   2. POST /api/auth/login via the AuthContext.
 *   3. On success -> AuthContext stores token + user -> router.push("/").
 *   4. On error -> display the API's error message inline + keep the
 *      form interactive.
 *
 * All UI labels and validation messages come from the i18n
 * dictionary (`messages/{en,bn}.json`). Bangla text generally
 * renders wider than English, so all field containers are
 * `flex-col` with no fixed widths on the labels.
 */
export function CustomerLoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const next: typeof errors = {};
    if (!email) next.email = t("auth.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t("auth.invalidEmail");
    if (!password) next.password = t("auth.required");
    else if (password.length < 6)
      next.password = t("auth.passwordTooShort");
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email, password });
      router.push("/");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof AuthApiError) {
        // Map known backend errors to the right field. Anything else
        // (network / 5xx) surfaces as a top-of-form banner.
        const msg = err.message.toLowerCase();
        if (msg.includes("email") || msg.includes("valid address")) {
          setErrors((prev) => ({ ...prev, email: err.message }));
        } else if (msg.includes("password")) {
          setErrors((prev) => ({ ...prev, password: err.message }));
        } else {
          setFormError(err.message);
        }
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError(t("errors.generic"));
      }
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[32px] font-extrabold leading-[1.15] text-ink">
          {t("auth.loginTitle")}
        </h1>
        <p className="text-[15px] font-normal text-ink-muted leading-[1.4]">
          {t("auth.loginSubtitle")}
        </p>
      </header>

      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand"
        >
          {formError}
        </div>
      ) : null}

      <CustomerAuthField
        name="email"
        type="email"
        autoComplete="email"
        label={t("auth.email")}
        placeholder="you@gmail.com"
        error={errors.email}
      />
      <CustomerAuthPasswordField
        name="password"
        autoComplete="current-password"
        label={t("auth.password")}
        placeholder="********"
        error={errors.password}
        trailing={
          <div className="flex justify-end">
            <Link
              href="/forgot-password?role=CUSTOMER&next=/login"
              className="text-[12px] font-semibold text-brand hover:underline"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
        }
      />
      <CustomerAuthSubmitButton pending={submitting}>
        {t("auth.login")}
      </CustomerAuthSubmitButton>
    </form>
  );
}