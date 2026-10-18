"use client";

import { useState } from "react";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { PartnerReviewsHeader } from "@/components/partner/dashboard/PartnerReviewsHeader";
import { ReviewSummaryRow } from "@/components/partner/dashboard/ReviewSummaryRow";
import { ReviewsListPanel } from "@/components/partner/dashboard/ReviewsListPanel";
import { RequireAuth } from "@/components/auth/RequireAuth";
import type { ReviewSummary } from "@/lib/reviews";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Orchestrator for /partner/reviews.
 *
 * Two-column shell: 260px sidebar (white) + flex-1 main column.
 * Main column = white header strip + 32px-padded body. The body
 * stacks the rating-summary row and the customer-reviews panel.
 *
 * `summary` lives in the orchestrator so the parent summary card and
 * the reviews list share one source of truth — the list re-fetches
 * after each successful reply and notifies the parent via
 * `onSummaryChange`, which keeps both panes in lock-step without a
 * full reload.
 */
export function PartnerReviewsPage() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const t = useT();

  return (
    <RequireAuth role="PARTNER">
      <PartnerShell activeKey="reviews">
        <PartnerReviewsHeader />

        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 sm:gap-8 lg:p-8">
          <ReviewSummaryRow summary={summary} />
          <section
            aria-label={t("partner.reviews.list.title")}
            className="flex flex-col gap-4"
          >
            <h2 className="font-display text-[16px] font-extrabold text-ink">
              {t("partner.reviews.list.title")}
            </h2>
            <ReviewsListPanel onSummaryChange={setSummary} />
          </section>
        </div>
      </PartnerShell>
    </RequireAuth>
  );
}
