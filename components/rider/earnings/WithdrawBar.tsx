"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";
import Image from "next/image";
import { BanknoteIcon, CheckIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";

/**
 * Sticky-bottom "Cash Out" bar on the rider earnings page.
 *
 *   • Reads the rider's saved payment accounts from
 *     `/api/riders/payment-details` on mount.
 *   • Shows a dropdown so the rider picks which pre-registered
 *     account to withdraw to. No more typing a destination at
 *     payout time — that flow was moved to /rider/settings.
 *   • If the rider has no saved account, the bar renders a
 *     disabled CTA + a pointer to Settings (mirrors the partner
 *     side).
 *   • Cash Out posts to `/api/rider/payouts`. The server
 *     re-derives the balance + minimum so the client can't bypass
 *     the cap.
 */

type Method = "BKASH" | "NAGAD" | "ROCKET" | "CARD";

const METHOD_META: Record<Method, { label: string; brandSrc: string | null; alt: string | null }> = {
  BKASH: { label: "bKash", brandSrc: "/icons/bkash-logo.png", alt: "bKash" },
  NAGAD: { label: "Nagad", brandSrc: "/icons/nagad-logo.png", alt: "Nagad" },
  ROCKET: { label: "Rocket", brandSrc: "/icons/rocket-logo.png", alt: "Rocket" },
  CARD: { label: "Card", brandSrc: null, alt: null },
};

type Account = {
  id: string;
  label: string;
  method: Method;
  destination: string;
  accountHolder: string;
  isDefault: boolean;
};

function maskDestination(d: string): string {
  if (!d) return "";
  const digits = d.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return d;
  return `•••• ${digits.slice(-4)}`;
}

function parseTaka(s: string): number {
  return Number(s.replace(/[^\d.-]/g, "")) || 0;
}

export function WithdrawBar({
  availableBalance,
}: {
  availableBalance: string;
}) {
  const t = useT();
  const balance = parseTaka(availableBalance);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const MIN = 500;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch<{ accounts?: Account[] }>(
        "/api/riders/payment-details",
      );
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoaded(true);
        return;
      }
      const list = Array.isArray(res.data?.accounts) ? res.data!.accounts! : [];
      setAccounts(list);
      const initial = list.find((a) => a.isDefault) ?? list[0] ?? null;
      setSelectedId(initial ? initial.id : "");
      setLoaded(true);
    }
    load().catch(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => accounts.find((a) => a.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const canCashOut = balance >= MIN && selected !== null;

  const handleClick = async () => {
    if (!canCashOut || submitting || success) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ payout: { id: string; amount: number } }>(
      "/api/rider/payouts",
      {
        method: "POST",
        body: JSON.stringify({
          amount: Math.round(balance),
          paymentAccountId: selected!.id,
        }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSuccess(true);
  };

  const brandMeta = selected ? METHOD_META[selected.method] : null;

  return (
    <div
      data-withdraw-bar="true"
      // The bar sits at the bottom of the page's content card so
      // it stays the same width as the rest of the content. We
      // used to use `-mx-8` to bleed out to the page padding,
      // but a sticky element with a negative margin overflows the
      // viewport at 320px (8 × 4 = 32px wider than vw). Keep the
      // bar aligned with its parent so it can't escape the
      // viewport.
      className="sticky bottom-0 mt-2 flex flex-col gap-3 border-t border-line bg-white px-4 py-4 md:flex-row md:items-center md:justify-between md:px-0"
    >
      <div className="flex items-center gap-3">
        {brandMeta?.brandSrc ? (
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <Image
              src={brandMeta.brandSrc}
              alt={brandMeta.alt ?? ""}
              fill
              sizes="40px"
              className="object-cover"
            />
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff5f3] text-brand">
            <BanknoteIcon size={18} />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Available Balance
          </span>
          <span className="font-display text-[18px] font-extrabold text-ink">
            {availableBalance}
          </span>
          {loaded && accounts.length === 0 ? (
            <span className="text-[12px] font-semibold text-rose-600">
              Add a payment account from Settings first.
            </span>
          ) : selected ? (
            <span className="text-[12px] text-ink-muted">
              Withdraw · {brandMeta?.label} · {maskDestination(selected.destination)}
            </span>
          ) : (
            <span className="text-[12px] text-ink-muted">
              Pick a saved payout destination to enable Cash Out.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-3">
        {loaded && accounts.length > 0 ? (
          <select
            aria-label={t("rider.earnings.withdrawAccountAria")}
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            className="h-11 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink outline-none focus:border-brand"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {METHOD_META[a.method].label} · {maskDestination(a.destination)}
                {a.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        ) : null}
        {success ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-3 py-1.5 text-[12px] font-semibold text-[#16a34a]">
            <CheckIcon size={14} />
            Cash Out requested
          </span>
        ) : null}
        {loaded && accounts.length === 0 ? (
          <a
            href="/rider/settings"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-brand hover:border-brand"
          >
            Add payment account →
          </a>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={!canCashOut || submitting || success}
            data-action="withdraw-confirm"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? t("rider.earnings.withdrawProcessing")
              : success
                ? t("rider.earnings.withdrawRequested")
                : !canCashOut && balance < MIN
                  ? t("rider.earnings.withdrawInsufficient")
                  : t("rider.earnings.withdrawCashOut")}
          </button>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 md:flex-1"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
