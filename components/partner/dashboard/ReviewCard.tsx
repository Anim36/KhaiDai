"use client";

import { useState } from "react";
import { SendIcon } from "@/components/icons";
import { StarRatingRow } from "@/components/partner/dashboard/StarRatingRow";
import { apiFetch } from "@/lib/apiClient";
import type { ReviewDto } from "@/lib/reviews";
import { useT } from "@/lib/i18n/LocaleProvider";

type ReplyMode = "idle" | "composing" | "submitted";

export function ReviewCard({
  review,
  onReplied,
}: {
  review: ReviewDto;
  onReplied?: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<ReplyMode>(review.replyText ? "submitted" : "idle");
  const [draft, setDraft] = useState(review.replyText ?? "");
  const [submittedReply, setSubmittedReply] = useState<string | null>(
    review.replyText ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCompose = () => {
    setDraft(submittedReply ?? "");
    setError(null);
    setMode("composing");
  };

  const cancelCompose = () => {
    setDraft(submittedReply ?? "");
    setError(null);
    setMode(submittedReply ? "submitted" : "idle");
  };

  const submitReply = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ review: ReviewDto }>(
      `/api/reviews/${review.id}/reply`,
      {
        method: "PATCH",
        body: JSON.stringify({ replyText: trimmed }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSubmittedReply(res.data?.review.replyText ?? trimmed);
    setDraft("");
    setMode("submitted");
    onReplied?.();
  };

  const initials = (review.author.name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");

  return (
    <article
      data-review-id={review.id}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
          >
            {initials}
          </span>
          <div className="flex flex-col">
            <span className="text-[14px] font-bold text-ink">
              {review.author.name}
            </span>
            <span className="text-[12px] text-ink-muted">
              {new Date(review.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        <StarRatingRow value={review.rating} size={14} />
      </header>

      {review.comment ? (
        <p className="text-[14px] text-ink leading-relaxed whitespace-pre-line">
          {review.comment}
        </p>
      ) : null}

      {submittedReply && mode !== "composing" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("partner.reviews.card.yourReply")}
          </span>
          <p className="text-[14px] text-ink leading-relaxed whitespace-pre-line">
            {submittedReply}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={startCompose}
              className="text-[12px] font-semibold text-brand hover:underline"
            >
              {t("partner.common.edit")}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={startCompose}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:bg-surface"
          >
            <SendIcon size={12} />
            {t("partner.reviews.card.reply")}
          </button>
        </div>
      ) : null}

      {mode === "composing" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("partner.reviews.card.replyPlaceholder")}
            rows={3}
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-brand"
          />
          {error ? (
            <p className="text-[12px] text-rose-600">{error}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelCompose}
              className="rounded-md border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-muted hover:bg-surface"
            >
              {t("partner.common.cancel")}
            </button>
            <button
              type="button"
              onClick={submitReply}
              disabled={submitting || draft.trim().length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? t("partner.reviews.card.submitting") : t("partner.reviews.card.submitReply")}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}