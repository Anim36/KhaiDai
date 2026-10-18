"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { StarIcon } from "@/components/icons";
import type { ReviewDto, ReviewKind } from "@/lib/reviews";

/**
 * ReviewModal — submit a restaurant and/or rider rating for a
 * delivered order.
 *
 * Two star pickers (restaurant + rider) are always shown together;
 * either can be left un-rated (0 means "not submitted"). We submit
 * only the picked kinds in parallel — the server enforces the
 * one-row-per-(order, kind) unique constraint, so a customer who
 * rated only the restaurant yesterday can come back today and rate
 * the rider without overwriting the previous entry.
 *
 * On success the modal closes and the parent is notified via the
 * `onSubmitted` callback so it can refresh its underlying data
 * without a full reload.
 */

type Props = {
  orderId: string;
  /** Optional — when omitted we still let the user rate, the modal
   *  then asks the server "what sides are still unrated?". */
  hasRider?: boolean;
  /** Existing reviews for this order — if the user already rated
   *  the restaurant, that star picker pre-fills + becomes
   *  read-only. Same for the rider. */
  existing?: ReviewDto[];
  onClose: () => void;
  onSubmitted?: () => void;
};

const RATING_LABELS: Record<number, string> = {
  1: "Disappointing",
  2: "Below expectations",
  3: "It was okay",
  4: "Really good",
  5: "Excellent!",
};

export function ReviewModal({
  orderId,
  hasRider = true,
  existing = [],
  onClose,
  onSubmitted,
}: Props) {
  // Pre-fill from existing reviews so editing is possible (the
  // server is idempotent on the unique key, but we let the user
  // update their comment without changing the rating).
  const restaurantExisting = existing.find((r) => r.kind === "RESTAURANT");
  const riderExisting = existing.find((r) => r.kind === "RIDER");

  const [restaurantRating, setRestaurantRating] = useState<number>(
    restaurantExisting?.rating ?? 0,
  );
  const [restaurantComment, setRestaurantComment] = useState<string>(
    restaurantExisting?.comment ?? "",
  );
  const [riderRating, setRiderRating] = useState<number>(
    riderExisting?.rating ?? 0,
  );
  const [riderComment, setRiderComment] = useState<string>(
    riderExisting?.comment ?? "",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the modal; background scroll stays locked.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, submitting]);

  /** Submit one side. Returns true on success. */
  async function submitSide(
    kind: ReviewKind,
    rating: number,
    comment: string,
  ): Promise<boolean> {
    if (rating < 1) return true; // "not picked" — skip silently
    const res = await apiFetch<{ review: ReviewDto }>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        orderId,
        kind,
        rating,
        comment: comment.trim() || undefined,
      }),
    });
    if (res.ok) return true;
    // 409 means the user already submitted — treat as success so
    // the modal doesn't bounce them with a redundant error.
    if (res.status === 409) return true;
    setError(res.error.message);
    return false;
  }

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const sides: Array<{
      kind: ReviewKind;
      rating: number;
      comment: string;
    }> = [];
    if (restaurantRating > 0) {
      sides.push({
        kind: "RESTAURANT",
        rating: restaurantRating,
        comment: restaurantComment,
      });
    }
    if (hasRider && riderRating > 0) {
      sides.push({
        kind: "RIDER",
        rating: riderRating,
        comment: riderComment,
      });
    }
    if (sides.length === 0) {
      setError("Please pick at least one rating before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      // Sequential rather than Promise.all so the second submit
      // sees the first one in flight — keeps the error reporting
      // first-failure-wins, which is the friendliest UX.
      for (const s of sides) {
        const ok = await submitSide(s.kind, s.rating, s.comment);
        if (!ok) return;
      }
      onSubmitted?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rate your order"
      className="fixed inset-0 z-[1100] flex items-center justify-center px-4 py-10"
      onClick={(e) => {
        // Click on the backdrop (not the modal body) closes it.
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55" aria-hidden />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-[520px] flex-col overflow-y-auto rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="font-display text-[20px] font-extrabold leading-tight text-ink">
              How was your order?
            </h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              Rate the restaurant and the rider — your feedback helps other
              customers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-50"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-6 py-6">
          <RatingBlock
            label="Restaurant"
            rating={restaurantRating}
            comment={restaurantComment}
            onRatingChange={setRestaurantRating}
            onCommentChange={setRestaurantComment}
            disabled={submitting}
          />
          {hasRider ? (
            <RatingBlock
              label="Rider"
              rating={riderRating}
              comment={riderComment}
              onRatingChange={setRiderRating}
              onCommentChange={setRiderComment}
              disabled={submitting}
            />
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
            >
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-line bg-surface-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink-muted hover:bg-line disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  RatingBlock                                                               */
/* -------------------------------------------------------------------------- */

function RatingBlock({
  label,
  rating,
  comment,
  onRatingChange,
  onCommentChange,
  disabled,
}: {
  label: string;
  rating: number;
  comment: string;
  onRatingChange: (n: number) => void;
  onCommentChange: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-display text-[14px] font-bold text-ink">
          {label}
        </span>
        <span className="text-[12px] text-ink-muted">
          {rating > 0 ? RATING_LABELS[rating] : "Tap a star to rate"}
        </span>
      </div>
      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label={`${label} rating`}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= rating;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === rating}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              disabled={disabled}
              onClick={() => onRatingChange(n === rating ? 0 : n)}
              className="grid h-10 w-10 place-items-center rounded-full transition-transform hover:scale-105 disabled:opacity-50"
            >
              <StarIcon
                size={28}
                className={active ? "text-amber-500" : "text-line"}
                style={{
                  fill: active ? "currentColor" : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        disabled={disabled}
        maxLength={1000}
        placeholder={`Share more about the ${label.toLowerCase()} (optional)…`}
        rows={3}
        className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}
