"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import {
  PartnerField,
  PartnerPasswordField,
  PartnerSubmitButton,
} from "@/components/partner/PartnerField";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * /partner/login form body.
 *
 * Posts to /api/auth/login with `expectedRole: "PARTNER"` so the
 * server refuses to issue a JWT for any other role. The API returns
 * 403 with an explicit "This account is registered as <ROLE>..."
 * message which we surface as a top-of-form banner so the user knows
 * which portal to use instead.
 *
 * কাজ ২ — also exposes a "Forgot Password?" link that routes
 * through the shared /forgot-password page (role-agnostic).
 */
export function PartnerLoginForm() {
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
    if (!email) next.email = t("partner.auth.errors.emailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t("partner.auth.errors.emailInvalid");
    if (!password) next.password = t("partner.auth.errors.passwordRequired");
    else if (password.length < 6)
      next.password = t("partner.auth.errors.passwordMin");
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email, password, expectedRole: "PARTNER" });
      router.push("/partner/dashboard");
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
        setFormError("Something went wrong. Please try again.");
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
      <PartnerField
        name="email"
        label={t("partner.auth.email")}
        type="email"
        autoComplete="email"
        placeholder={t("partner.auth.emailPlaceholder")}
        error={errors.email}
      />
      <div className="flex flex-col gap-2">
        <PartnerPasswordField
          name="password"
          label={t("partner.auth.password")}
          autoComplete="current-password"
          placeholder={t("partner.auth.passwordPlaceholder")}
          error={errors.password}
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password?role=PARTNER&next=/partner/login"
            className="text-[12px] font-semibold text-brand hover:underline"
          >
            {t("partner.auth.forgotPassword")}
          </Link>
        </div>
      </div>
      <PartnerSubmitButton pending={submitting}>{t("partner.auth.login")}</PartnerSubmitButton>
    </form>
  );
}
