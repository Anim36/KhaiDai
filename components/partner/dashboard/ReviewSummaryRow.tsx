"use client";

import { StarRatingRow } from "@/components/partner/dashboard/StarRatingRow";
import type { ReviewSummary } from "@/lib/reviews";
import { useT } from "@/lib/i18n/LocaleProvider";

export function ReviewSummaryRow({
  summary,
}: {
  summary: ReviewSummary | null;
}) {
  const t = useT();
  return (
    <section
      aria-label={t("partner.reviews.summary.average")}
      className="flex flex-col gap-6 lg:flex-row lg:items-stretch"
    >
      <RatingSummaryCard summary={summary} />
      <RatingDistributionCard summary={summary} />
    </section>
  );
}

function RatingSummaryCard({ summary }: { summary: ReviewSummary | null }) {
  const t = useT();
  const count = summary?.count ?? 0;
  const average = summary?.average ?? 0;
  const rounded = Math.round(average);
  return (
    <article
      aria-label={t("partner.reviews.summary.average")}
      className="flex flex-1 items-center gap-8 rounded-2xl border border-line bg-white p-6"
    >
      <div className="flex flex-col gap-2 leading-normal">
        <span className="font-display text-[56px] font-extrabold text-ink leading-none">
          {count === 0 ? "—" : average.toFixed(1)}
        </span>
        <StarRatingRow value={rounded} size={18} />
        <span className="text-[12px] text-ink-muted">
          {count === 0
            ? t("partner.reviews.summary.total_zero")
            : t("partner.reviews.summary.total").replace("{n}", String(count))}
        </span>
      </div>
      <div className="ml-auto hidden md:flex flex-col items-end gap-1 text-right">
        <span className="text-[12px] font-semibold text-ink">
          {t("partner.reviews.summary.label")}
        </span>
        <span className="text-[12px] text-ink-muted max-w-[180px]">
          {t("partner.reviews.summary.cardSubtitle")}
        </span>
      </div>
    </article>
  );
}

function RatingDistributionCard({
  summary,
}: {
  summary: ReviewSummary | null;
}) {
  const t = useT();
  const breakdown = summary?.breakdown ?? [0, 0, 0, 0, 0];
  const total = breakdown.reduce((acc, n) => acc + n, 0);
  const order: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];

  return (
    <article
      aria-label={t("partner.reviews.summary.average")}
      className="flex flex-1 flex-col gap-3 rounded-2xl border border-line bg-white p-6"
    >
      <h2 className="font-display text-[14px] font-extrabold text-ink">
        {t("partner.reviews.summary.breakdown")}
      </h2>
      <ul className="flex flex-col gap-2">
        {order.map((stars) => {
          const count = breakdown[stars - 1];
          const pct = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <li
              key={stars}
              className="flex items-center gap-3"
              aria-label={`${stars} ${t("partner.reviews.summary.stars")}: ${count} (${pct}%)`}
            >
              <span className="w-10 shrink-0 text-[12px] font-semibold text-ink">
                {stars}*
              </span>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="relative h-2 flex-1 overflow-hidden rounded-full bg-line"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full rounded-full bg-brand"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-[12px] text-ink-muted">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}