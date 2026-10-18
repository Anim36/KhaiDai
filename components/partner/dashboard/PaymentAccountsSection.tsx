"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Reusable "Payment Accounts" section.
 *
 * Used by both the Partner Settings page and the Rider Settings
 * page. The shape of an account is identical between the two, so a
 * single component drives the inline CRUD UI:
 *   • List the saved accounts (label, method, masked destination,
 *     default star).
 *   • Inline "Add account" form with method / destination / holder.
 *   • Promote-to-default and delete per row.
 *
 * The two pages differ only in which API root they call
 * (`/api/partner/payment-accounts` vs `/api/riders/payment-details`),
 * so we expose that as a `apiBase` prop. Pass `i18nPrefix="partner.settings.sectionsPage.payment"`
 * to render the Bangla-aware labels (the rider partner side keeps
 * English for now — rider i18n is a separate pass).
 */

type Method = "BKASH" | "NAGAD" | "ROCKET" | "CARD";

const METHOD_META: Record<
  Method,
  { label: string; destinationHint: string; placeholder: string }
> = {
  BKASH: {
    label: "bKash",
    destinationHint:
      "Enter your bKash-registered phone number (e.g. +8801711005142).",
    placeholder: "+880 1711-005142",
  },
  NAGAD: {
    label: "Nagad",
    destinationHint: "Enter your Nagad-registered phone number.",
    placeholder: "+880 1711-005142",
  },
  ROCKET: {
    label: "Rocket",
    destinationHint: "Enter your Rocket-registered phone number.",
    placeholder: "+880 1711-005142",
  },
  CARD: {
    label: "Visa / Mastercard",
    destinationHint:
      "We'll only ever store the last 4 digits. Card on file must be in your name.",
    placeholder: "•••• •••• •••• 1234",
  },
};

export type PaymentAccount = {
  id: string;
  label: string;
  method: Method;
  destination: string;
  accountHolder: string;
  isDefault: boolean;
};

const METHOD_OPTIONS: Array<{ value: Method; label: string }> = (
  Object.keys(METHOD_META) as Method[]
).map((k) => ({ value: k, label: METHOD_META[k].label }));

function maskDestination(d: string): string {
  if (!d) return "";
  const digits = d.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return d;
  return `•••• ${digits.slice(-4)}`;
}

export function PaymentAccountsSection({
  apiBase,
  description,
  i18nPrefix,
}: {
  apiBase: string;
  description?: string;
  /** If set, all user-visible strings resolve from this dictionary
   *  prefix (e.g. "partner.settings.sectionsPage.payment"). If
   *  unset, the component renders English fallbacks (used by the
   *  rider settings page which is not yet i18n-wired). */
  i18nPrefix?: string;
}) {
  const t = useT();
  // When i18nPrefix is set we use the dictionary. The `tr(key)`
  // helper falls back to the literal English string when a leaf is
  // missing so a partial translation never leaves an unstyled "[…]"
  // behind in production.
  const tr = (key: string, fallback: string) =>
    i18nPrefix ? t(`${i18nPrefix}.${key}` as Parameters<typeof t>[0]) || fallback : fallback;
  const heading = tr("heading", "Payment Accounts");
  const addLabel = tr("add", "+ Add account");
  const cancelLabel = tr("cancel", "Cancel");
  const defaultLabel = tr("default", "Default");
  const makeDefaultLabel = tr("makeDefault", "Make default");
  const removeLabel = tr("remove", "Remove");
  const loadingLabel = tr("loading", "Loading your saved accounts…");
  const emptyLabel = tr(
    "empty",
    `You haven't added any payment accounts yet. Tap "+ Add account" to register your first one.`,
  );
  const nicknameLabel = tr("nickname", "Nickname");
  const nicknamePlaceholder = tr("nicknamePlaceholder", "e.g. Main bKash");
  const methodLabel = tr("method", "Method");
  const cardNumberLabel = tr("cardNumber", "Card number");
  const mobileNumberLabel = tr("mobileNumber", "Mobile number");
  const holderLabel = tr("holder", "Account holder name");
  const holderPlaceholder = tr("holderPlaceholder", "Name on the account");
  const useDefaultLabel = tr(
    "useDefault",
    "Use as default payout destination",
  );
  const saveLabel = tr("save", "Save account");
  const savingLabel = tr("saving", "Saving…");
  const defaultDescription = tr(
    "empty",
    `Add the bKash / Nagad / Rocket / Card accounts you want payouts to land in. The Earnings page picks from this list when you request a withdrawal.`,
  );
  const confirmRemove = (lbl: string) =>
    i18nPrefix
      ? t("partner.settings.sectionsPage.payment.confirmRemove" as Parameters<typeof t>[0])
          .replace("{label}", lbl)
      : `Remove "${lbl}" from your saved payment accounts? Future payouts can't use this destination.`;
  const errorLabelRequired = tr("errorLabelRequired", "Label is required.");
  const errorLabelTooLong = tr(
    "errorLabelTooLong",
    "Label must be 60 characters or fewer.",
  );
  const errorDestinationRequired = tr(
    "errorDestinationRequired",
    "Destination is required.",
  );
  const errorDestinationLength = tr(
    "errorDestinationLength",
    "Destination must be 3-32 characters.",
  );
  const errorHolderRequired = tr(
    "errorHolderRequired",
    "Account holder is required.",
  );
  const errorHolderTooShort = tr(
    "errorHolderTooShort",
    "Account holder name is too short.",
  );
  const errorHolderTooLong = tr(
    "errorHolderTooLong",
    "Account holder name is too long.",
  );

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [method, setMethod] = useState<Method>("BKASH");
  const [destination, setDestination] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Per-row busy state — disable the buttons while a single
  // mutation is in flight so we don't double-submit.
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await apiFetch<{ accounts?: PaymentAccount[] }>(apiBase);
    if (!res.ok) {
      setError(res.error.message);
      setAccounts([]);
      setLoading(false);
      return;
    }
    setAccounts(Array.isArray(res.data?.accounts) ? res.data!.accounts! : []);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const resetForm = () => {
    setLabel("");
    setMethod("BKASH");
    setDestination("");
    setAccountHolder("");
    setIsDefault(true);
    setFormErrors({});
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!label.trim()) errs.label = errorLabelRequired;
    else if (label.trim().length > 60) errs.label = errorLabelTooLong;
    if (!destination.trim()) errs.destination = errorDestinationRequired;
    else if (destination.trim().length < 3 || destination.trim().length > 32)
      errs.destination = errorDestinationLength;
    if (!accountHolder.trim()) errs.accountHolder = errorHolderRequired;
    else if (accountHolder.trim().length < 2)
      errs.accountHolder = errorHolderTooShort;
    else if (accountHolder.trim().length > 80)
      errs.accountHolder = errorHolderTooLong;
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (!validateForm()) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ account: PaymentAccount }>(apiBase, {
      method: "POST",
      body: JSON.stringify({
        label: label.trim(),
        method,
        destination: destination.trim(),
        accountHolder: accountHolder.trim(),
        isDefault,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    resetForm();
    setShowAdd(false);
    await refresh();
  };

  const handleMakeDefault = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    const res = await apiFetch<{ account: PaymentAccount }>(
      `${apiBase}?id=${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ isDefault: true }) },
    );
    setBusyId(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await refresh();
  };

  const handleDelete = async (id: string, lbl: string) => {
    if (busyId) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(confirmRemove(lbl));
      if (!ok) return;
    }
    setBusyId(id);
    setError(null);
    const res = await apiFetch(`${apiBase}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await refresh();
  };

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {heading}
          </h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowAdd((s) => !s);
            }}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white px-4 text-[12px] font-semibold text-ink hover:border-brand hover:text-brand"
          >
            {showAdd ? cancelLabel : addLabel}
          </button>
        </div>
        <p className="text-[12px] text-ink-muted">
          {description ?? defaultDescription}
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-[13px] font-semibold text-rose-700"
        >
          {error}
        </div>
      ) : null}

      {/* Account list */}
      {loading ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[12px] text-ink-muted">
          {loadingLabel}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[12px] text-ink-muted">
          {emptyLabel}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-ink">
                    {a.label}
                  </span>
                  {a.isDefault ? (
                    <span className="inline-flex items-center rounded-full bg-[#ffebe8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                      {defaultLabel}
                    </span>
                  ) : null}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {METHOD_META[a.method].label} · {maskDestination(a.destination)} ·{" "}
                  {a.accountHolder}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {a.isDefault ? null : (
                  <button
                    type="button"
                    onClick={() => handleMakeDefault(a.id)}
                    disabled={busyId === a.id}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {makeDefaultLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(a.id, a.label)}
                  disabled={busyId === a.id}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-rose-600 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {removeLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Inline add form */}
      {showAdd ? (
        <form
          onSubmit={handleAdd}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="acct-label"
                className="text-[12px] font-bold uppercase tracking-wide text-ink-muted"
              >
                {nicknameLabel}
              </label>
              <input
                id="acct-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={nicknamePlaceholder}
                className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-normal text-ink focus:border-brand focus:outline-none"
              />
              {formErrors.label ? (
                <span className="text-[12px] font-semibold text-rose-600">
                  {formErrors.label}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="acct-method"
                className="text-[12px] font-bold uppercase tracking-wide text-ink-muted"
              >
                {methodLabel}
              </label>
              <select
                id="acct-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-normal text-ink focus:border-brand focus:outline-none"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="acct-destination"
                className="text-[12px] font-bold uppercase tracking-wide text-ink-muted"
              >
                {method === "CARD" ? cardNumberLabel : mobileNumberLabel}
              </label>
              <input
                id="acct-destination"
                type={method === "CARD" ? "text" : "tel"}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={METHOD_META[method].placeholder}
                className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-normal text-ink focus:border-brand focus:outline-none"
              />
              {formErrors.destination ? (
                <span className="text-[12px] font-semibold text-rose-600">
                  {formErrors.destination}
                </span>
              ) : null}
              <span className="text-[11px] text-ink-muted">
                {METHOD_META[method].destinationHint}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="acct-holder"
                className="text-[12px] font-bold uppercase tracking-wide text-ink-muted"
              >
                {holderLabel}
              </label>
              <input
                id="acct-holder"
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder={holderPlaceholder}
                className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-normal text-ink focus:border-brand focus:outline-none"
              />
              {formErrors.accountHolder ? (
                <span className="text-[12px] font-semibold text-rose-600">
                  {formErrors.accountHolder}
                </span>
              ) : null}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            {useDefaultLabel}
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowAdd(false);
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? savingLabel : saveLabel}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}