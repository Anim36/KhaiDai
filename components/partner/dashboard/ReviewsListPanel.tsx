"use client";

import { useCallback, useEffect, useState } from "react";
import { ReviewCard } from "@/components/partner/dashboard/ReviewCard";
import { apiFetch } from "@/lib/apiClient";
import type { ReviewDto, ReviewSummary } from "@/lib/reviews";
import { useT } from "@/lib/i18n/LocaleProvider";

const PAGE_SIZE = 10;

type ReviewsPayload = {
  reviews: ReviewDto[];
  summary: ReviewSummary;
  nextCursor: string | null;
};

export function ReviewsListPanel({
  onSummaryChange,
}: {
  onSummaryChange: (summary: ReviewSummary) => void;
}) {
  const t = useT();
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      const res = await apiFetch<ReviewsPayload>(
        `/api/partner/reviews?${qs.toString()}`,
      );
      if (!res.ok) {
        setError(res.error.message || t("partner.common.loadFailed"));
        return null;
      }
      if (res.data) {
        onSummaryChange(res.data.summary);
        return res.data;
      }
      return null;
    },
    [onSummaryChange, t],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(null)
      .then((page) => {
        if (cancelled || !page) return;
        setReviews(page.reviews);
        setCursor(page.nextCursor);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleLoadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await fetchPage(cursor);
      if (page) {
        setReviews((prev) => [...prev, ...page.reviews]);
        setCursor(page.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReplied = async () => {
    // Refetch the first page so the summary card re-renders
    const page = await fetchPage(null);
    if (page) {
      setReviews(page.reviews);
      setCursor(page.nextCursor);
    }
  };

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
      >
        {error}
      </div>
    );
  }

  if (loading && reviews.length === 0) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={t("partner.common.pleaseWait")}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-line bg-white"
          />
        ))}
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-10 text-center">
        <span className="font-display text-[16px] font-extrabold text-ink">
          {t("partner.reviews.empty")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} onReplied={handleReplied} />
      ))}
      {cursor ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink-muted hover:bg-surface"
          >
            {loading ? t("partner.common.pleaseWait") : t("partner.reviews.list.loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}