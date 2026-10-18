"use client";

// `useSearchParams` forces the page to opt out of static
// generation unless its consumer is wrapped in a <Suspense>
// boundary (Next 14 requirement for `app/`). The page is fully
// client-rendered, so we hoist the URL-params reader into a
// child component and wrap that in a Suspense from the default
// export below.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CustomerAuthField,
  CustomerAuthPasswordField,
  CustomerAuthSubmitButton,
} from "@/components/auth/CustomerAuthField";

/**
 * /reset-password
 *
 * কাজ ২ — Step B of the forgot-password flow. The user typed
 * their email in /forgot-password, we redirected them here with
 * ?email=… carried over, and they now type the 6-digit code +
 * a new password (+ confirm password). We POST to
 * /api/auth/password-reset/confirm and on success redirect to
 * the per-role login page so they can sign in with the new
 * password.
 *
 * The page is role-agnostic — the email in the query string is
 * the only thing the user provided, and the server returns the
 * user's role in the success response. We honour a `?next=`
 * override (passed by the per-role entry points) so a partner
 * who lands here gets sent back to /partner/login, a rider to
 * /rider/login, and a customer to /login.
 *
 * The code-resend button calls /api/auth/password-reset/request
 * (not the registration OTP endpoint) so the rows it mints live
 * in the PASSWORD_RESET bucket — a registration code can't be
 * typed here, and a reset code can't be typed on the
 * registration form.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialEmail = params.get("email") || "";
  const role = (params.get("role") || "CUSTOMER").toUpperCase();
  const fallbackNext = (() => {
    if (role === "PARTNER") return "/partner/login";
    if (role === "RIDER") return "/rider/login";
    return "/login";
  })();
  const next = params.get("next") || fallbackNext;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: initialEmail,
          otp,
          newPassword: password,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error || "Could not reset password. Try again.");
        return;
      }
      // Success — push the user to the role-appropriate login
      // screen. The ?justReset=1 flag lets the login page show a
      // success banner ("Your password was just updated").
      const qs = new URLSearchParams({ justReset: "1" }).toString();
      router.push(`${next}?${qs}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0 || !initialEmail) return;
    setResendStatus("Sending…");
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: initialEmail }),
      });
      setResendStatus(
        "If the address is registered, a new code has been sent.",
      );
      setResendCooldown(60);
      const id = window.setInterval(() => {
        setResendCooldown((n) => {
          if (n <= 1) {
            window.clearInterval(id);
            return 0;
          }
          return n - 1;
        });
      }, 1000);
    } catch {
      setResendStatus("Network error. Try again.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-line bg-white p-8 shadow-card">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-extrabold text-ink">
            Choose a new password
          </h1>
          <p className="text-[13px] text-ink-muted">
            We sent a 6-digit code to{" "}
            <strong className="text-ink">{initialEmail}</strong>. Enter the
            code below and pick a new password.
          </p>
        </header>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
            >
              {error}
            </div>
          ) : null}

          <div className="flex w-full flex-col gap-2">
            <label
              htmlFor="reset-otp"
              className="text-[14px] font-semibold leading-none text-ink"
            >
              Verification code
            </label>
            <input
              id="reset-otp"
              name="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6-digit code"
              data-otp-input="true"
              className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[14px] font-semibold tracking-[0.4em] text-ink outline-none transition-colors placeholder:text-ink-muted placeholder:tracking-normal focus:border-brand"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={resend}
                disabled={resendCooldown > 0}
                data-action="resend-reset-code"
                className="text-[12px] font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
              </button>
              {resendStatus ? (
                <span className="text-[12px] text-ink-muted">
                  {resendStatus}
                </span>
              ) : null}
            </div>
          </div>

          <CustomerAuthField
            name="newPassword"
            type="password"
            autoComplete="new-password"
            label="New password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <CustomerAuthPasswordField
            name="confirmPassword"
            autoComplete="new-password"
            label="Confirm new password"
            placeholder="Re-enter your new password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
          />
          <CustomerAuthSubmitButton pending={submitting}>
            Update password
          </CustomerAuthSubmitButton>
        </form>
        <p className="text-center text-[12px] text-ink-muted">
          Got a new email?{" "}
          <Link
            href="/forgot-password"
            className="font-semibold text-brand hover:underline"
          >
            Start over
          </Link>
        </p>
      </div>
    </main>
  );
}