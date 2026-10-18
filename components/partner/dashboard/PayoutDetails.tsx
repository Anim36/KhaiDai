"use client";

import { useState } from "react";
import { WalletIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import type { EarningsPayout } from "@/components/partner/dashboard/usePartnerEarnings";
import { useT } from "@/lib/i18n/LocaleProvider";

export function PayoutDetails({
  balance,
  minPayout,
  canRequestPayout,
  payouts,
  onSuccess,
}: {
  balance: number;
  minPayout: number;
  canRequestPayout: boolean;
  payouts: EarningsPayout[];
  onSuccess: () => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"BKASH" | "NAGAD" | "ROCKET" | "CARD">("BKASH");
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < minPayout) {
      setError("Amount must be at least ৳" + minPayout.toLocaleString());
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const res = await apiFetch<unknown>("/api/payouts", {
      method: "POST",
      body: JSON.stringify({
        amount: parsed,
        method,
        destination,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setAmount("");
    setDestination("");
    setSuccess(t("partner.earnings.payout.submittedTitle"));
    onSuccess();
  };

  return (
    <section
      aria-label={t("partner.earnings.payout.requestButton")}
      className="flex flex-col gap-6 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
          <WalletIcon size={20} />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {t("partner.earnings.payout.requestButton")}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {t("partner.earnings.payout.note")}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("partner.earnings.summary.netEarnings")}
        </span>
        <span className="font-display text-[28px] font-extrabold text-ink">
          ৳{balance.toLocaleString()}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t("partner.earnings.payout.method")}>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "BKASH" | "NAGAD" | "ROCKET" | "CARD")}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
            >
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="ROCKET">Rocket</option>
              <option value="CARD">Card</option>
            </select>
          </Field>
          <Field label={t("partner.earnings.payout.destination")}>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t("partner.earnings.payout.amountPlaceholder")}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
            />
          </Field>
        </div>
        <Field label={t("partner.earnings.payout.amount")}>
          <input
            type="number"
            min={minPayout}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("partner.earnings.payout.amountPlaceholder")}
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
          />
        </Field>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700"
          >
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !canRequestPayout}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t("partner.common.pleaseWait") : t("partner.earnings.payout.requestButton")}
        </button>
        {!canRequestPayout ? (
          <p className="text-[12px] text-ink-muted">
            {t("partner.common.loadFailed")}
          </p>
        ) : null}
      </form>

      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold text-ink">
          {t("partner.earnings.transactions.title")}
        </h3>
        <p className="text-[12px] text-ink-muted">
          {t("partner.earnings.transactions.subtitle")}
        </p>
        {payouts.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            {t("partner.earnings.transactions.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payouts.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-[12px]"
              >
                <span className="text-ink-muted">{p.date}</span>
                <span className="font-semibold text-ink">{p.amount}</span>
                <span
                  className={
                    "inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold " +
                    (p.status === "paid"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700")
                  }
                >
                  {p.status === "paid" ? t("partner.earnings.transactions.status.PAID") : t("partner.earnings.transactions.status.PENDING")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-muted">{label}</span>
      {children}
    </label>
  );
}