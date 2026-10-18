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
import { CustomerAuthField, CustomerAuthSubmitButton } from "@/components/auth/CustomerAuthField";

/**
 * /forgot-password
 *
 * কাজ ২ — Step A of the forgot-password flow. We collect the
 * user's email, POST it to /api/auth/password-reset/request,
 * and show a generic "If the email is registered, we've sent a
 * 6-digit code" message — regardless of whether the email is
 * actually on file. We never reveal whether an email is
 * registered.
 *
 * Role is a `?role=` query string — it's only a UX hint used to
 * pick the `next=` redirect destination on success (so the
 * partner portal can land the user back at /partner/login). The
 * server-side confirm endpoint is role-agnostic — it looks up
 * the User by email and returns the user's role in the response.
 *
 * UI follows the same CustomerAuthField language as the /login
 * page so the look is consistent. The button label changes to
 * "Send reset code" so users with one tab open for login and
 * one for reset don't confuse the two flows.
 */
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}

function ForgotPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const role = (params.get("role") || "CUSTOMER").toUpperCase();
  const next = params.get("next") || "/login";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const data = new FormData(e.currentTarget);
    const value = String(data.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      // Privacy — we don't look at the response. We don't surface
      // the server's `delivered` flag, don't reveal "this email
      // is registered", and don't expose rate-limit message (the
      // API returns generic 200 + `retryAfter` regardless). We
      // show the same generic message either way.
      setEmail(value);
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-line bg-white p-8 shadow-card">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-[22px] font-extrabold text-ink">
              Check your inbox
            </h1>
            <p className="text-[13px] text-ink-muted">
              If an account exists for{" "}
              <strong className="text-ink">{email}</strong>, we've sent a
              6-digit code to it. Enter the code on the next screen to choose a
              new password.
            </p>
          </header>
          <button
            type="button"
            onClick={() => {
              const qs = new URLSearchParams({ email, role, next }).toString();
              router.push(`/reset-password?${qs}`);
            }}
            data-action="forgot-continue"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-[15px] font-bold text-white transition hover:bg-brand-600"
          >
            Continue
          </button>
          <p className="text-center text-[12px] text-ink-muted">
            Didn't get the code?{" "}
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
              }}
              className="font-semibold text-brand hover:underline"
            >
              Try again
            </button>
          </p>
          <div className="text-center">
            <Link
              href={next}
              className="text-[12px] font-semibold text-brand hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-line bg-white p-8 shadow-card">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-extrabold text-ink">
            Forgot your password?
          </h1>
          <p className="text-[13px] text-ink-muted">
            Enter your email and we'll send a 6-digit reset code. If the
            address matches an account, the code arrives within a minute.
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
          <CustomerAuthField
            name="email"
            type="email"
            autoComplete="email"
            label="Email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <CustomerAuthSubmitButton pending={submitting}>
            Send reset code
          </CustomerAuthSubmitButton>
        </form>
        <p className="text-center text-[12px] text-ink-muted">
          Remembered it?{" "}
          <Link
            href={next}
            className="font-semibold text-brand hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}