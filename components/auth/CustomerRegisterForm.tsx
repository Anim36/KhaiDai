"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import {
  CustomerAuthField,
  CustomerAuthPasswordField,
  CustomerAuthSubmitButton,
} from "@/components/auth/CustomerAuthField";
import { OtpField } from "@/components/auth/OtpField";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * /register form — Bug 3 fix: two-step flow.
 *
 *   Step 1 — Personal details: name, email, phone, password,
 *            confirm. "Continue" button runs client-side
 *            validation AND fires the OTP request (the email
 *            exists-or-not check is the server's job).
 *   Step 2 — Verify your email: shows the entered email,
 *            "Resend code" link, OTP input, "Verify & Create
 *            Account" button, "Back" link. The single POST
 *            carries the full payload (name/phone/password
 *            + email + otp) so the server creates the User
 *            atomically.
 *
 * All UI labels, error messages, and validation copy come from
 * the i18n dictionary.
 */
type FormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
  referralCode: string;
};

export function CustomerRegisterForm({
  initialReferralCode = null,
}: {
  initialReferralCode?: string | null;
}) {
  const router = useRouter();
  const { register } = useAuth();
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState("");

  const [state, setState] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    referralCode: initialReferralCode ?? "",
  });
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirm?: string;
    otp?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  const validateStep1 = (): boolean => {
    const next: typeof errors = {};
    if (state.name.trim().length < 2)
      next.name = t("register.errors.nameRequired");
    if (!state.email.trim()) next.email = t("auth.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email))
      next.email = t("auth.invalidEmail");
    if (!state.password) next.password = t("auth.required");
    else if (state.password.length < 8)
      next.password = t("register.errors.passwordTooShort");
    if (!state.confirm) next.confirm = t("register.errors.confirmRequired");
    else if (state.confirm !== state.password)
      next.confirm = t("register.errors.passwordsDontMatch");
    setErrors(next);
    return !next.name && !next.email && !next.password && !next.confirm;
  };

  const handleContinue = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (!validateStep1()) return;

    setFormError(null);
    await apiFetch("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({
        email: state.email.trim().toLowerCase(),
        purpose: "REGISTRATION",
      }),
    }).catch(() => {
      // Swallow — step 2's Resend button can recover.
    });
    setStep(2);
  };

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    if (!otp || otp.length !== 6) {
      setErrors((p) => ({
        ...p,
        otp: t("register.errors.otpRequired"),
      }));
      return;
    }
    setErrors((p) => ({ ...p, otp: undefined }));
    setFormError(null);
    setSubmitting(true);
    try {
      await register({
        name: state.name.trim(),
        email: state.email.trim(),
        password: state.password,
        phone: state.phone.trim() || undefined,
        role: "CUSTOMER",
        otp,
        referralCode: state.referralCode.trim() || undefined,
      });
      router.push("/");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof AuthApiError) {
        const msg = err.message.toLowerCase();
        if (msg.includes("already") || msg.includes("email")) {
          setErrors((p) => ({ ...p, email: err.message }));
          setStep(1);
        } else if (msg.includes("code")) {
          setErrors((p) => ({ ...p, otp: err.message }));
        } else if (msg.includes("password")) {
          setErrors((p) => ({ ...p, password: err.message }));
          setStep(1);
        } else if (msg.includes("name")) {
          setErrors((p) => ({ ...p, name: err.message }));
          setStep(1);
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[32px] font-extrabold leading-[1.15] text-ink">
          {t("auth.registerTitle")}
        </h1>
        <p className="text-[15px] font-normal text-ink-muted leading-[1.4]">
          {step === 1
            ? t("auth.registerSubtitle")
            : t("register.step2Subtitle")}
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

      {step === 1 ? (
        <form
          onSubmit={handleContinue}
          noValidate
          className="flex flex-col gap-6"
        >
          <CustomerAuthField
            name="name"
            label={t("auth.name")}
            autoComplete="name"
            placeholder={t("auth.name")}
            value={state.name}
            onChange={(e) => setField("name", e.target.value)}
            error={errors.name}
          />
          <CustomerAuthField
            name="email"
            type="email"
            autoComplete="email"
            label={t("auth.email")}
            placeholder="you@gmail.com"
            value={state.email}
            onChange={(e) => setField("email", e.target.value)}
            error={errors.email}
          />
          <CustomerAuthField
            name="phone"
            type="tel"
            autoComplete="tel"
            label={t("auth.phone") + " (" + t("common.optional") + ")"}
            placeholder="+880"
            value={state.phone}
            onChange={(e) => setField("phone", e.target.value)}
          />
          <CustomerAuthField
            name="referralCode"
            type="text"
            autoComplete="off"
            label={t("register.referralCode")}
            placeholder="ABC123"
            value={state.referralCode}
            onChange={(e) =>
              setField(
                "referralCode",
                e.target.value.toUpperCase().replace(/\s+/g, ""),
              )
            }
          />
          <CustomerAuthPasswordField
            name="password"
            autoComplete="new-password"
            label={t("auth.password")}
            placeholder={t("register.passwordHint")}
            value={state.password}
            onChange={(e) => setField("password", e.target.value)}
            error={errors.password}
          />
          <CustomerAuthPasswordField
            name="confirm"
            autoComplete="new-password"
            label={t("auth.confirmPassword")}
            placeholder={t("register.confirmHint")}
            value={state.confirm}
            onChange={(e) => setField("confirm", e.target.value)}
            error={errors.confirm}
          />
          <CustomerAuthSubmitButton pending={false}>
            {t("register.continue")}
          </CustomerAuthSubmitButton>
        </form>
      ) : (
        <form
          onSubmit={handleVerify}
          noValidate
          className="flex flex-col gap-6"
        >
          <div className="rounded-2xl border border-line bg-surface px-5 py-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {t("register.verifyEmail")}
            </span>
            <p className="mt-1 text-[15px] font-normal leading-snug text-ink">
              {t("register.codeSentTo")}{" "}
              <span className="font-semibold">{state.email}</span>.{" "}
              {t("register.enterCodeBelow")}
            </p>
          </div>

          <OtpField
            email={state.email}
            value={otp}
            onChange={setOtp}
            error={errors.otp}
          />

          <CustomerAuthSubmitButton pending={submitting}>
            {t("register.verifyAndCreate")}
          </CustomerAuthSubmitButton>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setOtp("");
              setErrors((p) => ({ ...p, otp: undefined }));
              setFormError(null);
              setStep(1);
            }}
            className="h-10 w-full rounded-xl text-[14px] font-semibold text-ink-muted hover:text-ink disabled:opacity-60"
          >
            {t("register.backToForm")}
          </button>
        </form>
      )}
    </div>
  );
}