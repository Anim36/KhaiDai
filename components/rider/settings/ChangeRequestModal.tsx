"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * "Contact KhaiDai support" / "Reach out to support" modal.
 *
 * The rider writes an optional note describing why they want to
 * update their locked profile / vehicle fields. Submission hits
 * `POST /api/riders/profile-change-request` which creates a
 * PENDING ProfileChangeRequest row for the admin queue.
 *
 * Props:
 *   open        — controlled open flag
 *   onClose     — callback to close
 *   requestType — "PROFILE_INFO" | "VEHICLE_INFO"
 *   onSubmitted — called with the new request id after success so
 *                 the parent can refresh its PENDING badge.
 */
export function ChangeRequestModal({
  open,
  onClose,
  requestType,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  requestType: "PROFILE_INFO" | "VEHICLE_INFO";
  onSubmitted?: (requestId: string) => void;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset transient state every time we open so a stale error
  // from a previous attempt doesn't bleed into a fresh open.
  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  if (!open) return null;

  const titleKey =
    requestType === "PROFILE_INFO"
      ? "rider.settings.changeRequest.modalTitle"
      : "rider.settings.changeRequest.modalTitleVehicle";
  const introKey =
    requestType === "PROFILE_INFO"
      ? "rider.settings.changeRequest.modalIntro"
      : "rider.settings.changeRequest.modalIntroVehicle";

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ request: { id: string } }>(
        "/api/riders/profile-change-request",
        {
          method: "POST",
          body: JSON.stringify({
            requestType,
            note: note.trim(),
          }),
        },
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setSuccess(true);
      onSubmitted?.(res.data?.request.id ?? "");
    } catch {
      setError(t("rider.settings.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 px-3 py-6 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-card border border-line bg-white p-6 shadow-card">
        <header className="flex flex-col gap-2">
          <h2 className="font-display text-[20px] font-extrabold text-ink">
            {t(titleKey)}
          </h2>
          <p className="text-[13px] leading-snug text-ink-muted">
            {t(introKey)}
          </p>
        </header>

        {success ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700"
          >
            {t("rider.settings.changeRequest.success")}
          </div>
        ) : (
          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold text-ink">
              {t("rider.settings.changeRequest.noteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(
                "rider.settings.changeRequest.notePlaceholder",
              )}
              rows={4}
              maxLength={1000}
              className="w-full rounded-xl border border-line bg-surface-page px-4 py-3 text-[14px] font-normal text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
        )}

        {error ? (
          <p
            role="alert"
            className="text-[12px] font-semibold text-rose-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-11 rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60"
          >
            {t("rider.settings.changeRequest.cancel")}
          </button>
          {success ? (
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl bg-brand px-5 text-[13px] font-bold text-white hover:brightness-105"
            >
              {t("rider.settings.changeRequest.cancel")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              data-action={`submit-change-request-${requestType}`}
              className="h-11 rounded-xl bg-brand px-5 text-[13px] font-bold text-white hover:brightness-105 disabled:opacity-60"
            >
              {submitting
                ? t("rider.settings.changeRequest.submitting")
                : t("rider.settings.changeRequest.submit")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status badge + rejected banner + editable section                            */
/* -------------------------------------------------------------------------- */

export type LatestChangeRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
} | null;

/** Small pill that shows when the rider has a PENDING request. */
export function PendingChangeRequestBadge() {
  const t = useT();
  return (
    <span
      data-change-request-pending
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-amber-500"
      />
      {t("rider.settings.changeRequest.pendingBadge")}
    </span>
  );
}

/** Inline banner shown when the latest request for this type was rejected. */
export function RejectedChangeRequestBanner({
  adminNote,
}: {
  adminNote: string | null;
}) {
  const t = useT();
  return (
    <div
      role="status"
      data-change-request-rejected
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] font-medium text-rose-700"
    >
      <span className="block font-bold">
        {t("rider.settings.changeRequest.rejectedTitle")}
      </span>
      {adminNote ? (
        <span className="mt-1 block">{adminNote}</span>
      ) : null}
      <span className="mt-2 block text-rose-600/80">
        {t("rider.settings.changeRequest.rejectedHint")}
      </span>
    </div>
  );
}

/** Inline banner shown above the form once an admin approved a request. */
export function EditableAfterApprovalBanner() {
  const t = useT();
  return (
    <p
      data-change-request-editable
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] font-medium text-emerald-700"
    >
      {t("rider.settings.changeRequest.editableAfterApproval")}
    </p>
  );
}