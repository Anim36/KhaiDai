"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import {
  RiderField,
  RiderPasswordField,
  RiderSubmitButton,
} from "@/components/rider/RiderField";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * /rider/login form body.
 *
 * Two fields — email + password. Posts to /api/auth/login with
 * `expectedRole: "RIDER"` so the server refuses to issue a JWT for
 * any other role. On success the AuthContext stores a token +
 * role=RIDER user and we push to /rider/dashboard.
 *
 * If the API returns 403 (wrong-role), we surface the message as a
 * top-of-form banner so the user picks the right login page next
 * time.
 */
export function RiderLoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const next: typeof errors = {};
    if (!email) next.email = t("rider.auth.errors.emailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t("rider.auth.errors.emailInvalid");
    if (!password) next.password = t("rider.auth.errors.passwordRequired");
    else if (password.length < 6)
      next.password = t("rider.auth.errors.passwordShort");
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email, password, expectedRole: "RIDER" });
      router.push("/rider/dashboard");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof AuthApiError) {
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
        setFormError(t("rider.common.somethingWrong"));
      }
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand"
        >
          {formError}
        </div>
      ) : null}
      <RiderField
        name="email"
        label={t("rider.auth.login.emailLabel")}
        type="email"
        autoComplete="email"
        placeholder={t("rider.auth.login.emailPlaceholder")}
        error={errors.email}
      />
      <div className="flex flex-col gap-2">
        <RiderPasswordField
          name="password"
          label={t("rider.auth.login.passwordLabel")}
          autoComplete="current-password"
          placeholder={t("rider.auth.login.passwordPlaceholder")}
          error={errors.password}
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password?role=RIDER&next=/rider/login"
            className="text-[12px] font-semibold text-brand hover:underline"
          >
            {t("rider.auth.login.forgotPassword")}
          </Link>
        </div>
      </div>
      <RiderSubmitButton pending={submitting}>
        {t("rider.auth.login.submit")}
      </RiderSubmitButton>
    </form>
  );
}