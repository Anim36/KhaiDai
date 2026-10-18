"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Reusable "Send Code / Type code" field pair used by all three
 * registration forms. Renders one input that the user fills with
 * the 6-digit code, plus a "Send Code" button that calls
 * `POST /api/auth/otp/request`.
 *
 * Why it's controlled inside this component (not lifted):
 *   • The cooldown countdown only matters to the button.
 *   • Keeping the OTP request state local keeps the parent form's
 *     submit logic simple — it only cares that `value` is a 6-digit
 *     string when the user clicks Register.
 *
 * The parent passes:
 *   • `email` — what we send the OTP to. If the user changes the
 *     email AFTER requesting a code we clear `value` so they can't
 *     submit a stale code by accident.
 *   • `value` / `onChange` — controlled OTP value.
 *   • `error` — surfaced inline so the user sees "Incorrect code"
 *     next to the field instead of as a banner.
 */
type Props = {
  email: string;
  value: string;
  onChange: (next: string) => void;
  /** Server-side error from the parent (e.g. "Incorrect code"). */
  error?: string;
  /** Used to give the button + status a unique label id. */
  labelId?: string;
};

const COOLDOWN_S = 60;

export function OtpField({ email, value, onChange, error, labelId }: Props) {
  const t = useT();
  const [sending, setSending] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);

  // If the email changes after a code was sent, the pending code is
  // tied to the OLD address — wipe the typed code so the user can't
  // accidentally submit the wrong one.
  useEffect(() => {
    onChange("");
    setStatusMsg(null);
    setStatusErr(null);
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the cooldown counter down so the button label says
  // "Resend in 23s" instead of being silently disabled.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = window.setInterval(() => {
      setCooldownLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownLeft]);

  const sendCode = useCallback(async () => {
    if (sending) return;
    if (!email) {
      setStatusErr(t("authOtp.enterEmailFirst"));
      return;
    }
    setSending(true);
    setStatusErr(null);
    setStatusMsg(null);
    // Bug 2 fix — when a brand-new code is being issued, wipe any
    // digits the user typed for the OLD code. Without this the user
    // can hit "Create account" against a freshly-sent code while the
    // input still shows the digits from the previous one, getting a
    // confusing "Incorrect code" against what they thought was a
    // current value. The wipe runs on the REQUEST — not on success —
    // because once the new request is in flight the old code is
    // already useless on the server (the server invalidates prior
    // rows when a new one is created).
    onChange("");
    const res = await apiFetch<{
      ok?: boolean;
      delivered?: boolean;
      retryAfter?: number;
      message?: string;
    }>("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ email, purpose: "REGISTRATION" }),
    });
    setSending(false);
    if (!res.ok) {
      setStatusErr(res.error.message);
      return;
    }
    if (res.status === 429 && typeof res.data?.retryAfter === "number") {
      setCooldownLeft(Math.min(COOLDOWN_S, Math.max(1, res.data.retryAfter)));
      setStatusMsg(res.data.message ?? t("authOtp.pleaseWait"));
      return;
    }
    setStatusMsg(
      res.data?.delivered === false
        ? t("authOtp.deliveryFailed")
        : t("authOtp.codeSent"),
    );
    // Default 60s cooldown even on success — the email body says
    // "expires in 10 minutes" so the user has plenty of time, but
    // 60s keeps the request rate at the server-configured limit.
    setCooldownLeft(COOLDOWN_S);
  }, [sending, email]);

  const buttonDisabled = sending || cooldownLeft > 0;
  const buttonLabel = sending
    ? t("authOtp.sending")
    : cooldownLeft > 0
      ? t("authOtp.resendIn", { n: cooldownLeft })
      : t("authOtp.sendCode");

  return (
    <div className="flex w-full flex-col gap-2">
      <label
        htmlFor={labelId ?? "otp-field"}
        className="text-[14px] font-semibold leading-none text-ink"
      >
        {t("authOtp.label")}
      </label>
      <div className="flex w-full gap-2">
        <input
          id={labelId ?? "otp-field"}
          name="otp"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={value}
          onChange={(e) => {
            // Strip non-digits, cap at 6 chars. Keeps the input
            // phone-style (numbers only) without trapping paste of
            // "123-456" which we silently clean.
            const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6);
            onChange(cleaned);
          }}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${labelId ?? "otp-field"}-error` : undefined}
          placeholder="6-digit code"
          data-otp-input="true"
          className={
            "h-12 w-full rounded-xl border bg-white px-4 text-[14px] font-semibold tracking-[0.4em] text-ink outline-none transition-colors placeholder:text-ink-muted placeholder:tracking-normal " +
            (error
              ? "border-rose-500 focus:border-rose-500"
              : "border-line focus:border-brand")
          }
        />
        <button
          type="button"
          onClick={sendCode}
          disabled={buttonDisabled}
          data-action="send-otp"
          className="h-12 shrink-0 rounded-xl border border-brand bg-white px-4 text-[13px] font-semibold text-brand transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {buttonLabel}
        </button>
      </div>
      {error ? (
        <span className="text-[12px] font-normal text-rose-500">{error}</span>
      ) : null}
      {statusErr ? (
        <span className="text-[12px] font-normal text-rose-500">{statusErr}</span>
      ) : null}
      {statusMsg && !error ? (
        <span className="text-[12px] font-normal text-ink-muted">
          {statusMsg}
        </span>
      ) : null}
    </div>
  );
}