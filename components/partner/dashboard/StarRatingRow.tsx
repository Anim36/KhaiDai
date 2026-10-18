"use client";

import { StarIcon } from "@/components/icons";

/**
 * Static row of 5 stars where the first `value` are filled in
 * brand-red and the rest are ink-muted.
 *
 *   • Filled star: `text-brand` — matches the Figma's #ff4d30 fill.
 *   • Empty  star: `text-line`   — light grey so unfilled stars are
 *     recognisable but recede visually.
 *
 * Reused in the rating summary card (so the average-rating row) and
 * on every individual review card (so each review's star score).
 *
 * Accepts custom size + className so the same row can render at
 * 16px (summary card), 14px (review cards), etc.
 */
export function StarRatingRow({
  value,
  size = 16,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  // Clamp to 0..5 — even malformed data shouldn't crash the row.
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div
      role="img"
      aria-label={`${value} out of 5 stars`}
      className={
        "flex items-center gap-0.5 " + (className ?? "")
      }
    >
      {[1, 2, 3, 4, 5].map((idx) => (
        <StarIcon
          key={idx}
          size={size}
          className={idx <= filled ? "text-brand" : "text-line"}
        />
      ))}
    </div>
  );
}
