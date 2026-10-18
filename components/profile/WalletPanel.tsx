// /components/profile/WalletPanel.tsx
//
// "My Wallet" tab — customer-only.
//
//   • Top: big balance card (৳ + token count + "Swap Tokens" +
//     "Withdraw" actions).
//   • Below: full transaction history (newest first, capped at 50).
//
// Reads /api/wallet on mount + after each mutation. Mutations:
//   • "Swap Tokens"  → POST /api/wallet/swap-tokens
//                      (rounds to nearest 100; no UI for custom).
//   • "Withdraw"     → POST /api/wallet/withdraw-request
//                      (see Feat 5; lets the customer pick
//                      payout method + amount).
//
// This panel does NOT compute or trust any amount coming from the
// client — every mutation posts only the chosen amount / method;
// the server recomputes the balance delta.

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

type WireWallet = {
  balance: number;
  tokenBalance: number;
};

type WireTransaction = {
  id: string;
  type:
    | "REFUND"
    | "CASHBACK"
    | "WITHDRAWAL"
    | "ADJUSTMENT"
    | "TOKEN_EARNED"
    | "TOKEN_SWAPPED";
  amount: number;
  description: string;
  relatedOrderId: string | null;
  createdAt: string;
};

// Transaction-type labels are translated inline via
// `t("wallet.type.<TYPE>")` so the panel flips with the rest of
// the app when the user toggles Bangla/English. The colour tone
// stays platform-controlled and is not localised.
const TYPE_TONE: Record<WireTransaction["type"], string> = {
  REFUND: "bg-emerald-50 text-emerald-700",
  CASHBACK: "bg-emerald-50 text-emerald-700",
  WITHDRAWAL: "bg-rose-50 text-rose-700",
  ADJUSTMENT: "bg-amber-50 text-amber-700",
  TOKEN_EARNED: "bg-blue-50 text-blue-700",
  TOKEN_SWAPPED: "bg-blue-50 text-blue-700",
};

function formatTaka(n: number): string {
  return `৳${n.toLocaleString()}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WalletPanel() {
  const t = useT();
  const [wallet, setWallet] = useState<WireWallet | null>(null);
  const [txs, setTxs] = useState<WireTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Swap-tokens modal.
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapAmount, setSwapAmount] = useState(100);
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Withdraw modal (Feat 5).
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(100);
  const [withdrawMethod, setWithdrawMethod] = useState("BKASH");
  const [withdrawDestination, setWithdrawDestination] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ wallet: WireWallet; transactions: WireTransaction[] }>(
      "/api/wallet",
    );
    if (!res.ok) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setError(null);
    setWallet(res.data?.wallet ?? null);
    setTxs(res.data?.transactions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Swap-tokens handler — server enforces the "multiple of 100" rule
  // so we don't need to validate here; we still disable for
  // UX-feedback when the user doesn't have enough.
  const handleSwap = useCallback(async () => {
    setSwapBusy(true);
    setSwapError(null);
    const res = await apiFetch<{ wallet: WireWallet }>(
      "/api/wallet/swap-tokens",
      {
        method: "POST",
        body: JSON.stringify({ tokenAmount: swapAmount }),
      },
    );
    setSwapBusy(false);
    if (!res.ok) {
      setSwapError(res.error.message);
      return;
    }
    setSwapOpen(false);
    await load();
  }, [load, swapAmount]);

  // Withdraw handler — sends to the admin review queue. We disable
  // the submit button until the destination looks plausible. The
  // server still validates the amount against the actual balance.
  const handleWithdraw = useCallback(async () => {
    setWithdrawBusy(true);
    setWithdrawError(null);
    const res = await apiFetch<{ ok: boolean; withdrawalRequest: { id: string } }>(
      "/api/wallet/withdraw-request",
      {
        method: "POST",
        body: JSON.stringify({
          amount: withdrawAmount,
          payoutMethod: withdrawMethod,
          payoutDestination: withdrawDestination.trim(),
        }),
      },
    );
    setWithdrawBusy(false);
    if (!res.ok) {
      setWithdrawError(res.error.message);
      return;
    }
    setWithdrawOpen(false);
    setWithdrawSuccess(t("wallet.withdrawSuccess"));
    setWithdrawDestination("");
    setWithdrawAmount(100);
    await load();
  }, [load, withdrawAmount, withdrawDestination, withdrawMethod]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-white p-12 text-center text-ink-muted">
        {t("wallet.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-white p-12 text-center text-rose-700">
        {error}
      </div>
    );
  }
  if (!wallet) {
    return null;
  }

  const canSwap = wallet.tokenBalance >= 100;
  const swapOptions = canSwap
    ? [100, 200, 500, wallet.tokenBalance]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .filter((n) => n <= wallet.tokenBalance)
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Big balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-sm">
        <p className="text-[12px] uppercase tracking-widest text-white/70">
          {t("wallet.availableBalance")}
        </p>
        <p className="mt-1 font-display text-4xl font-extrabold">
          {formatTaka(wallet.balance)}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-4">
          <div>
            <p className="text-[12px] uppercase tracking-widest text-white/70">
              {t("wallet.loyaltyTokens")}
            </p>
            <p className="mt-1 font-display text-xl font-bold">
              {wallet.tokenBalance.toLocaleString()} {t("wallet.tokens")}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSwapOpen(true)}
              disabled={!canSwap}
              className="rounded-lg bg-white/20 px-3 py-2 text-[12px] font-semibold backdrop-blur transition hover:bg-white/30 disabled:opacity-50"
              title={
                canSwap
                  ? t("wallet.swapTokensTitleReady")
                  : t("wallet.swapTokensTitle")
              }
            >
              {t("wallet.swapTokens")}
            </button>
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              disabled={wallet.balance <= 0}
              className="rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-brand transition hover:bg-white/90 disabled:opacity-50"
              title={
                wallet.balance > 0
                  ? t("wallet.withdrawBalanceTitle")
                  : t("wallet.noBalanceToWithdraw")
              }
            >
              {t("wallet.withdraw")}
            </button>
          </div>
        </div>
      </div>

      {withdrawSuccess ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
          {withdrawSuccess}
        </div>
      ) : null}

      {/* History */}
      <div className="rounded-2xl border border-line bg-white">
        <div className="border-b border-line p-5">
          <h3 className="font-display text-lg font-extrabold text-ink">
            {t("wallet.transactionHistory")}
          </h3>
          <p className="mt-1 text-[12px] text-ink-muted">
            {t("wallet.transactionHistorySubtitle")}
          </p>
        </div>
        {txs.length === 0 ? (
          <div className="p-12 text-center text-ink-muted">
            {t("wallet.noTransactions")}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {txs.map((tx) => (
              <li key={tx.id} className="flex items-center gap-4 p-5">
                <span
                  className={
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold " +
                    (TYPE_TONE[tx.type] ?? "bg-ink-muted/10 text-ink-muted")
                  }
                >
                  {t(`wallet.type.${tx.type}` as Parameters<typeof t>[0])}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    {tx.description}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    {formatDate(tx.createdAt)}
                  </p>
                </div>
                <span
                  className={
                    "font-display text-base font-extrabold " +
                    (tx.amount >= 0 ? "text-emerald-700" : "text-rose-700")
                  }
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {tx.type.startsWith("TOKEN_")
                    ? `${tx.amount.toLocaleString()} ${t("wallet.tokens")}`
                    : formatTaka(tx.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Swap-tokens modal */}
      {swapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-extrabold text-ink">
              {t("wallet.swapModalTitle")}
            </h3>
            <p className="mt-1 text-[13px] text-ink-muted">
              {t("wallet.swapModalSubtitle")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {swapOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSwapAmount(n)}
                  className={
                    "rounded-full border px-3 py-1.5 text-[13px] font-semibold " +
                    (swapAmount === n
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-ink hover:border-brand")
                  }
                >
                  {n.toLocaleString()} {t("wallet.tokens")}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-ink-muted">
              {t("wallet.swapGet")
                .replace("{cash}", formatTaka(swapAmount))
                .replace("{tokens}", swapAmount.toLocaleString())}
            </p>
            {swapError && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                {swapError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSwapOpen(false)}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
              >
                {t("wallet.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSwap}
                disabled={swapBusy}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {swapBusy ? t("wallet.swapSubmitting") : t("wallet.swapSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw modal (Feat 5) */}
      {withdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-extrabold text-ink">
              {t("wallet.withdrawModalTitle")}
            </h3>
            <p className="mt-1 text-[13px] text-ink-muted">
              {t("wallet.withdrawModalSubtitle").replace("{amount}", formatTaka(wallet.balance))}
            </p>
            <label className="mt-4 block">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-ink-muted">
                {t("wallet.withdrawAmount")}
              </span>
              <input
                type="number"
                min={1}
                max={wallet.balance}
                step={1}
                value={withdrawAmount}
                onChange={(e) =>
                  setWithdrawAmount(
                    Math.min(
                      wallet.balance,
                      Math.max(1, Number(e.target.value) || 0),
                    ),
                  )
                }
                className="mt-1 w-full rounded-lg border border-line p-2 text-[14px]"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-ink-muted">
                {t("wallet.payoutMethod")}
              </span>
              <select
                value={withdrawMethod}
                onChange={(e) => setWithdrawMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line p-2 text-[14px]"
              >
                <option value="BKASH">{t("profile.payment.kind.BKASH")}</option>
                <option value="NAGAD">{t("profile.payment.kind.NAGAD")}</option>
                <option value="ROCKET">{t("profile.payment.kind.ROCKET")}</option>
                <option value="CARD">{t("profile.payment.kind.CARD")}</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-ink-muted">
                {t("wallet.destination")}
              </span>
              <input
                type="text"
                placeholder={
                  withdrawMethod === "CARD"
                    ? t("wallet.destinationCardPlaceholder")
                    : t("wallet.destinationPhonePlaceholder")
                }
                value={withdrawDestination}
                onChange={(e) => setWithdrawDestination(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line p-2 text-[14px]"
              />
            </label>
            {withdrawError ? (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                {withdrawError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWithdrawOpen(false)}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
              >
                {t("wallet.cancel")}
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={
                  withdrawBusy ||
                  withdrawAmount <= 0 ||
                  withdrawAmount > wallet.balance ||
                  withdrawDestination.trim().length < 3
                }
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {withdrawBusy ? t("wallet.submitting") : t("wallet.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}