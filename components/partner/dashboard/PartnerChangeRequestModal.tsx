"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Partner-side counterpart of the rider `ChangeRequestModal`. Same
 * shape: optional note + Submit. Hits
 * `POST /api/partner/profile-change-request`.
 *
 * The modal lives at the same UX layer as the rider one but uses
 * its own i18n prefix so we can translate partner copy
 * independently ("Restaurant info" vs "Profile details" etc.).
 *
 * Props mirror the rider modal so the parent settings page can
 * switch between them with one render path.
 */
export function PartnerChangeRequestModal({
  open,
  onClose,
  requestType,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  requestType: "RESTAURANT_PROFILE" | "RESTAURANT_LOCATION";
  onSubmitted?: (requestId: string) => void;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  if (!open) return null;

  const titleKey =
    requestType === "RESTAURANT_PROFILE"
      ? "partner.settings.changeRequest.modalTitle"
      : "partner.settings.changeRequest.modalTitleLocation";
  const introKey =
    requestType === "RESTAURANT_PROFILE"
      ? "partner.settings.changeRequest.modalIntro"
      : "partner.settings.changeRequest.modalIntroLocation";

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ request?: { id: string } }>(
      "/api/partner/profile-change-request",
      {
        method: "POST",
        body: JSON.stringify({
          requestType,
          note: note.trim(),
        }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      // 409 surfaces the partner already has a pending request.
      // Show the server message — it's safe to display.
      setError(res.error.message);
      return;
    }
    const id = res.data?.request?.id;
    if (id && onSubmitted) onSubmitted(id);
    setSuccess(true);
    // Auto-close on success after a short beat so the partner
    // sees the green confirmation.
    window.setTimeout(() => {
      onClose();
    }, 900);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-change-request-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 md:items-center"
      data-modal="partner-change-request"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3
          id="partner-change-request-title"
          className="font-display text-[18px] font-extrabold text-ink"
        >
          {t(titleKey)}
        </h3>
        <p className="mt-2 text-[12px] text-ink-muted">{t(introKey)}</p>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink">
            {t("partner.settings.changeRequest.noteLabel")}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("partner.settings.changeRequest.notePlaceholder")}
            maxLength={1000}
            rows={4}
            className="resize-y rounded-xl border border-line bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-brand"
          />
          <span className="text-[10px] text-ink-muted">
            {t("partner.settings.changeRequest.noteHint", {
              count: 1000 - note.length,
            })}
          </span>
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700"
          >
            {t("partner.settings.changeRequest.success")}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:text-ink"
          >
            {t("partner.settings.changeRequest.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {submitting
              ? t("partner.settings.changeRequest.submitting")
              : t("partner.settings.changeRequest.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny standalone badge that surfaces a PENDING request in the
 * partner Settings page header. Mirrors `PendingChangeRequestBadge`
 * in the rider flow.
 */
export function PartnerPendingChangeRequestBadge({
  requestType,
}: {
  requestType: "RESTAURANT_PROFILE" | "RESTAURANT_LOCATION";
}) {
  const t = useT();
  return (
    <span
      data-pending-request={requestType}
      className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700"
    >
      {t("partner.settings.changeRequest.pendingBadge")}
    </span>
  );
}

/**
 * Banner shown under a section when the partner's most-recent
 * request for that group was REJECTED. Same shape as the rider
 * version so the UI is consistent across both roles.
 */
export function PartnerRejectedChangeRequestBanner({
  adminNote,
}: {
  adminNote: string | null;
}) {
  const t = useT();
  return (
    <div
      role="status"
      data-rejected-banner="true"
      className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[12px] text-rose-700"
    >
      <strong className="block font-bold">
        {t("partner.settings.changeRequest.rejectedTitle")}
      </strong>
      <span className="mt-1 block text-rose-700/90">
        {adminNote ?? t("partner.settings.changeRequest.rejectedHint")}
      </span>
    </div>
  );
}

/**
 * Banner shown above the section when an admin APPROVED the
 * request and the partner is now allowed to update the fields.
 * Once the partner saves, the flag clears and the banner goes
 * away on the next page load.
 */
export function PartnerEditableAfterApprovalBanner() {
  const t = useT();
  return (
    <div
      role="status"
      data-editable-banner="true"
      className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-700"
    >
      <strong className="block font-bold">
        {t("partner.settings.changeRequest.editableAfterApprovalTitle")}
      </strong>
      <span className="mt-1 block text-emerald-700/90">
        {t("partner.settings.changeRequest.editableAfterApproval")}
      </span>
    </div>
  );
}

export type LatestPartnerChangeRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};