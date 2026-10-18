"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { TicketIcon } from "@/components/icons";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { apiFetch } from "@/lib/apiClient";
import { MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_BYTES_MB } from "@/lib/upload-limits";
import { prepareImageForUpload } from "@/lib/clientImage";
import { useT } from "@/lib/i18n/LocaleProvider";

export function PartnerPromoCodesPage() {
  return (
    <RequireAuth role="PARTNER">
      <PartnerPromoCodesContent />
    </RequireAuth>
  );
}

type PromoCode = {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  createdByPartner: boolean;
  createdAt: string;
  restaurantId: string | null;
  imageUrl: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "noRestaurant" }
  | { kind: "ready"; codes: PromoCode[] }
  | { kind: "error"; message: string };

function PartnerPromoCodesContent() {
  const t = useT();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [showForm, setShowForm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    const res = await apiFetch<{ codes: PromoCode[] }>(
      "/api/partner/promo-codes",
    );
    if (!res.ok) {
      if (
        res.status === 400 &&
        res.error.message.includes("restaurant")
      ) {
        setState({ kind: "noRestaurant" });
        return;
      }
      setState({ kind: "error", message: res.error.message });
      return;
    }
    setState({ kind: "ready", codes: res.data?.codes ?? [] });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleToggle(p: PromoCode) {
    setActionError(null);
    const res = await apiFetch<{ code: PromoCode }>(
      `/api/partner/promo-codes/${p.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ isActive: !p.isActive }),
      },
    );
    if (!res.ok) {
      setActionError(res.error.message);
      return;
    }
    setState((s) => {
      if (s.kind !== "ready") return s;
      return {
        kind: "ready",
        codes: s.codes.map((c) =>
          c.id === p.id ? { ...c, isActive: !p.isActive } : c,
        ),
      };
    });
  }

  async function handleDelete(p: PromoCode) {
    setActionError(null);
    const res = await apiFetch<unknown>(`/api/partner/promo-codes/${p.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setActionError(res.error.message);
      return;
    }
    setPendingDeleteId(null);
    setState((s) => {
      if (s.kind !== "ready") return s;
      return {
        kind: "ready",
        codes: s.codes.filter((c) => c.id !== p.id),
      };
    });
  }

  return (
    <PartnerShell activeKey="promoCodes">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8 w-full">
          <div className="flex flex-col gap-1 leading-normal">
            <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
              {t("partner.promoCodes.title")}
            </h1>
            <p className="text-[13px] text-ink-muted">
              {t("partner.promoCodes.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-8">
          {actionError ? (
            <div
              role="alert"
              className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
            >
              {actionError}
            </div>
          ) : null}

          {state.kind === "loading" ? (
            <Skeleton />
          ) : state.kind === "noRestaurant" ? (
            <NoRestaurantState />
          ) : state.kind === "error" ? (
            <ErrorState message={state.message} onRetry={reload} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="text-[13px] text-ink-muted">
                  {state.codes.length === 0
                    ? "—"
                    : `${state.codes.length} ${t("partner.promoCodes.title")}`}
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  + {t("partner.promoCodes.createButton")}
                </button>
              </div>

              {state.codes.length === 0 ? (
                <EmptyState onCreate={() => setShowForm(true)} />
              ) : (
                <PromoCodeTable
                  codes={state.codes}
                  onToggle={handleToggle}
                  onDelete={(p) => setPendingDeleteId(p.id)}
                />
              )}
            </>
          )}
        </div>

      {showForm ? (
        <PromoCodeFormModal
          onClose={() => setShowForm(false)}
          onCreated={(c) => {
            setShowForm(false);
            setState((s) => {
              if (s.kind !== "ready") return s;
              return { kind: "ready", codes: [c, ...s.codes] };
            });
          }}
        />
      ) : null}

      {pendingDeleteId ? (
        <ConfirmDeleteModal
          code={state.kind === "ready"
            ? state.codes.find((c) => c.id === pendingDeleteId)
            : null}
          onClose={() => setPendingDeleteId(null)}
          onConfirm={(p) => void handleDelete(p)}
        />
      ) : null}
    </PartnerShell>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-2xl border border-line bg-white"
        />
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-line bg-white px-8 py-12 text-center">
      <div className="text-brand">
        <TicketIcon size={48} />
      </div>
      <h2 className="font-display text-[20px] font-bold text-ink">
        {t("partner.promoCodes.empty")}
      </h2>
      <p className="max-w-sm text-[13px] text-ink-muted">
        {t("partner.promoCodes.subtitle")}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        + {t("partner.promoCodes.createButton")}
      </button>
    </div>
  );
}

function NoRestaurantState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-white px-8 py-12 text-center">
      <h2 className="font-display text-[18px] font-bold text-ink">
        {t("partner.common.backToHome")}
      </h2>
      <p className="max-w-sm text-[13px] text-ink-muted">
        {t("partner.menu.empty")}
      </p>
      <a
        href="/partner/dashboard"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white"
      >
        {t("partner.common.backToHome")}
      </a>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-8 py-12 text-center">
      <h2 className="font-display text-[18px] font-bold text-brand">
        {t("partner.common.loadFailed")}
      </h2>
      <p className="max-w-sm text-[13px] text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white"
      >
        {t("partner.common.retry")}
      </button>
    </div>
  );
}

function PromoCodeTable({
  codes,
  onToggle,
  onDelete,
}: {
  codes: PromoCode[];
  onToggle: (p: PromoCode) => void;
  onDelete: (p: PromoCode) => void;
}) {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f9fafb] text-[12px] uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-4 py-3">{t("partner.promoCodes.columns.code")}</th>
            <th className="px-4 py-3">{t("partner.promoCodes.columns.value")}</th>
            <th className="px-4 py-3">{t("partner.promoCodes.columns.minOrder")} / {t("partner.promoCodes.columns.maxDiscount")}</th>
            <th className="px-4 py-3">{t("partner.promoCodes.columns.expires")}</th>
            <th className="px-4 py-3">{t("partner.promoCodes.columns.usage")}</th>
            <th className="px-4 py-3">{t("partner.promoCodes.columns.active")}</th>
            <th className="px-4 py-3 text-right">{t("partner.promoCodes.columns.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {codes.map((c) => (
            <PromoCodeRow
              key={c.id}
              code={c}
              onToggle={() => onToggle(c)}
              onDelete={() => onDelete(c)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromoCodeRow({
  code,
  onToggle,
  onDelete,
}: {
  code: PromoCode;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const discountLabel =
    code.discountType === "PERCENTAGE"
      ? `${code.discountValue}%`
      : `৳${code.discountValue}`;
  const capLabel =
    code.discountType === "PERCENTAGE" && code.maxDiscount !== null
      ? `৳${code.maxDiscount}`
      : "—";
  const minLabel =
    code.minOrderAmount !== null ? `৳${code.minOrderAmount}` : "—";
  const expiryLabel = code.expiresAt
    ? new Date(code.expiresAt).toLocaleDateString()
    : t("partner.promoCodes.expiresNever");
  const usageLabel =
    code.usageLimit === null
      ? t("partner.promoCodes.usageUnlimited").replace("{used}", String(code.usedCount))
      : t("partner.promoCodes.usageFmt").replace("{used}", String(code.usedCount)).replace("{limit}", String(code.usageLimit));

  return (
    <tr className="text-ink">
      <td className="px-4 py-3 font-bold uppercase tracking-wide">{code.code}</td>
      <td className="px-4 py-3">{discountLabel}</td>
      <td className="px-4 py-3 text-ink-muted">
        <div>{minLabel}</div>
        <div className="text-[11px]">{capLabel}</div>
      </td>
      <td className="px-4 py-3 text-ink-muted">{expiryLabel}</td>
      <td className="px-4 py-3 text-ink-muted">{usageLabel}</td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={code.isActive ? t("partner.promoCodes.inactive") : t("partner.promoCodes.active")}
          className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
            code.isActive ? "bg-brand" : "bg-line"
          }`}
        >
          <span
            aria-hidden
            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
              code.isActive ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`ml-2 text-[11px] font-bold ${
            code.isActive ? "text-emerald-600" : "text-ink-muted"
          }`}
        >
          {code.isActive ? t("partner.promoCodes.active") : t("partner.promoCodes.inactive")}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-line bg-white px-3 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
        >
          {t("partner.common.delete")}
        </button>
      </td>
    </tr>
  );
}

type FormState = {
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string;
  minOrderAmount: string;
  maxDiscount: string;
  expiresAt: string;
  usageLimit: string;
  imageUrl: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  discountType: "FIXED",
  discountValue: "",
  minOrderAmount: "",
  maxDiscount: "",
  expiresAt: "",
  usageLimit: "",
  imageUrl: "",
};

function PromoCodeFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: PromoCode) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const onImageFile = async (file: File | null) => {
    setImageError(null);
    if (!file) return;
    try {
      // Compress first so the data URL stays inside Vercel's
      // 4.5 MB body cap alongside the rest of the JSON payload.
      const dataUrl = await prepareImageForUpload(file);
      if (dataUrl.length > MAX_MENU_IMAGE_BYTES) {
        setImageError(
          `Image is still too large after compression (max ${MAX_MENU_IMAGE_BYTES_MB} MB). Try a smaller file.`,
        );
        return;
      }
      setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "Could not read the file.",
      );
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const body: Record<string, unknown> = {
      code: form.code,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
    };
    if (form.minOrderAmount.trim() !== "")
      body.minOrderAmount = Number(form.minOrderAmount);
    if (form.maxDiscount.trim() !== "")
      body.maxDiscount = Number(form.maxDiscount);
    if (form.expiresAt.trim() !== "")
      body.expiresAt = new Date(form.expiresAt).toISOString();
    if (form.usageLimit.trim() !== "")
      body.usageLimit = Number(form.usageLimit);
    if (form.imageUrl.trim() !== "")
      body.imageUrl = form.imageUrl;

    setSubmitting(true);
    const res = await apiFetch<{ code: PromoCode }>(
      "/api/partner/promo-codes",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (res.data?.code) onCreated(res.data.code);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="promo-form-title" className="font-display text-[18px] font-bold text-ink">
            {t("partner.promoCodes.form.createTitle")}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-ink-muted hover:text-ink"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto p-6">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] font-semibold text-brand"
            >
              {error}
            </div>
          ) : null}

          <Field label={t("partner.promoCodes.form.code") + " — " + t("partner.promoCodes.form.codeHelp")}>
            <input
              required
              type="text"
              value={form.code}
              onChange={(e) =>
                setForm({ ...form, code: e.target.value.toUpperCase() })
              }
              placeholder="WELCOME10"
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] uppercase tracking-wide outline-none focus:border-brand"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("partner.promoCodes.form.discountType")}>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discountType: e.target.value as "PERCENTAGE" | "FIXED",
                  })
                }
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
              >
                <option value="FIXED">৳</option>
                <option value="PERCENTAGE">%</option>
              </select>
            </Field>
            <Field label={t("partner.promoCodes.form.discountValue")}>
              <input
                required
                type="number"
                min={1}
                max={form.discountType === "PERCENTAGE" ? 100 : undefined}
                value={form.discountValue}
                onChange={(e) =>
                  setForm({ ...form, discountValue: e.target.value })
                }
                placeholder={form.discountType === "PERCENTAGE" ? "10" : "50"}
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("partner.promoCodes.form.minOrder")}>
              <input
                type="number"
                min={0}
                value={form.minOrderAmount}
                onChange={(e) =>
                  setForm({ ...form, minOrderAmount: e.target.value })
                }
                placeholder="e.g. 200"
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
              />
            </Field>
            <Field label={t("partner.promoCodes.form.maxDiscount")}>
              <input
                type="number"
                min={1}
                disabled={form.discountType === "FIXED"}
                value={form.maxDiscount}
                onChange={(e) =>
                  setForm({ ...form, maxDiscount: e.target.value })
                }
                placeholder="e.g. 100"
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand disabled:bg-[#f9fafb] disabled:text-ink-muted"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("partner.promoCodes.form.expiresAt")}>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({ ...form, expiresAt: e.target.value })
                }
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
              />
            </Field>
            <Field label={t("partner.promoCodes.form.usageLimit")}>
              <input
                type="number"
                min={1}
                value={form.usageLimit}
                onChange={(e) =>
                  setForm({ ...form, usageLimit: e.target.value })
                }
                placeholder="e.g. 100"
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] outline-none focus:border-brand"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-ink-muted">
              {t("partner.promoCodes.form.usageLimit")}
            </span>
            <div className="flex items-center gap-4">
              <div
                aria-hidden
                className="flex h-20 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-[#f9fafb] text-brand"
              >
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <TicketIcon size={36} />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label className="flex h-10 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:text-ink">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) =>
                      onImageFile(e.target.files?.[0] ?? null)
                    }
                  />
                  {form.imageUrl ? t("partner.common.edit") : t("partner.common.save")}
                </label>
                {form.imageUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, imageUrl: "" }))
                    }
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:border-rose-300 hover:text-rose-600"
                  >
                    {t("partner.common.remove")}
                  </button>
                ) : null}
              </div>
            </div>
            {imageError ? (
              <p className="text-[12px] font-semibold text-rose-600">
                {imageError}
              </p>
            ) : (
              <p className="text-[11px] text-ink-muted">
                JPG/PNG/SVG, up to {MAX_MENU_IMAGE_BYTES_MB} MB.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line bg-white px-4 py-2 text-[13px] font-semibold text-ink hover:bg-[#f9fafb]"
            >
              {t("partner.common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? t("partner.common.pleaseWait") : t("partner.promoCodes.form.savePromo")}
            </button>
          </div>
        </form>
      </div>
    </div>
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

function ConfirmDeleteModal({
  code,
  onClose,
  onConfirm,
}: {
  code: PromoCode | null | undefined;
  onClose: () => void;
  onConfirm: (p: PromoCode) => void;
}) {
  const t = useT();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!code) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-delete-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-sm flex-col rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="promo-delete-title" className="font-display text-[18px] font-bold text-ink">
          {t("partner.promoCodes.deleteConfirm").replace("{code}", code.code)}
        </h2>
        <p className="mt-2 text-[13px] text-ink-muted">
          <span className="font-bold uppercase text-ink">{code.code}</span>
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-white px-4 py-2 text-[13px] font-semibold text-ink hover:bg-[#f9fafb]"
          >
            {t("partner.common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(code)}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-white hover:opacity-90"
          >
            {t("partner.common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}