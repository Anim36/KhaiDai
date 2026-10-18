"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import {
  PartnerField,
  PartnerPasswordField,
  PartnerSubmitButton,
} from "@/components/partner/PartnerField";

/**
 * /admin/login form body.
 *
 * Mirrors the partner login form so the visual chrome stays
 * consistent: same field chrome, same submit button, same error
 * pattern. Posts to /api/auth/login with `expectedRole: "ADMIN"` so
 * the server refuses to issue a JWT for any other role.
 *
 * The page that hosts this form supplies its own two-column
 * shell (`AdminAuthLayout` below) — this file is body-only.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const { login } = useAuth();
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
    if (!email) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    else if (password.length < 6)
      next.password = "Password must be at least 6 characters.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email, password, expectedRole: "ADMIN" });
      router.push("/admin/dashboard");
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
        label="Admin email"
        type="email"
        autoComplete="email"
        placeholder="admin@khaidai.com"
        error={errors.email}
      />
      <PartnerPasswordField
        name="password"
        label="Password"
        autoComplete="current-password"
        placeholder="••••••••"
        error={errors.password}
      />
      <PartnerSubmitButton pending={submitting}>Sign in</PartnerSubmitButton>
    </form>
  );
}
