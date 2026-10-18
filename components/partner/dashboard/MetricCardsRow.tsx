"use client";

import {
  ClockIcon,
  StarIcon,
  WalletIcon,
} from "@/components/icons";
import {
  metricCards,
  type MetricCardData,
} from "@/data/partner-dashboard";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * 3-card stat strip that sits at the top of the partner dashboard
 * (Figma `metrics-row` frame, data-node-id 4:1803).
 *
 * Layout: 24px gap, equal-flex cards with 1px `#e5e7eb` border,
 * 16px radius, 24px padding. Each card pairs an "icon-badge" tile
 * (12px padding, brand-tinted bg via `tone`) with a label/value/caption
 * text block.
 *
 * Real-data override: pass `metrics` to render today's numbers from
 * the API instead of the static demo cards. The same three ids
 * ("orders", "revenue", "rating") are reused so the layout is stable.
 */
export function MetricCardsRow({
  metrics,
}: {
  metrics?: { orders?: number; revenue?: number; rating?: number };
} = {}) {
  const t = useT();
  const cards: MetricCardData[] = metrics
    ? [
        {
          id: "orders",
          label: t("partner.dashboard.metrics.todaysOrders"),
          value: String(metrics.orders ?? 0),
          caption:
            (metrics.orders ?? 0) === 0
              ? "—"
              : t("partner.dashboard.metrics.todaysOrdersHelp"),
          tone: "blue",
        },
        {
          id: "revenue",
          label: t("partner.dashboard.metrics.todaysRevenue"),
          value: `৳${(metrics.revenue ?? 0).toLocaleString()}`,
          caption: t("partner.dashboard.metrics.todaysRevenueHelp"),
          tone: "red",
        },
        {
          id: "rating",
          label: t("partner.dashboard.metrics.averageRating"),
          value:
            metrics.rating && metrics.rating > 0
              ? `${metrics.rating.toFixed(1)} / 5`
              : "0.0 / 5",
          caption: t("partner.dashboard.metrics.averageRatingHelp"),
          tone: "yellow",
        },
      ]
    : metricCards;

  return (
    <section
      aria-label="Today's metrics"
      className="flex flex-col gap-6 lg:flex-row lg:items-stretch"
    >
      {cards.map((card) => (
        <MetricCard key={card.id} card={card} />
      ))}
    </section>
  );
}

function MetricCard({ card }: { card: MetricCardData }) {
  return (
    <article className="flex flex-1 items-center justify-between rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-col gap-2 leading-normal">
        <span className="text-[13px] text-ink-muted">{card.label}</span>
        <span className="font-display text-[26px] font-extrabold text-ink leading-none">
          {card.value}
        </span>
        <span className="text-[12px] text-ink-muted">{card.caption}</span>
      </div>
      <span
        aria-hidden
        className={
          "flex h-12 w-12 items-center justify-center rounded-xl " +
          metricToneClass(card.tone)
        }
      >
        <MetricIcon tone={card.tone} />
      </span>
    </article>
  );
}

/**
 * Tinted background class for the icon-badge tile. Matches the Figma
 * `rgba(<brand>, 0.12)` value so the badge reads as a soft halo of
 * the underlying icon colour, not a solid block.
 */
function metricToneClass(tone: MetricCardData["tone"]) {
  switch (tone) {
    case "red":
      return "bg-[rgba(255,77,48,0.12)] text-brand";
    case "blue":
      return "bg-[rgba(59,130,246,0.12)] text-[#3b82f6]";
    case "yellow":
      return "bg-[rgba(255,149,0,0.12)] text-[#ff9500]";
  }
}

/** Icon-by-tone switch keeps the card preview pure (icon colour set
 *  via `toneClass`, stroke via `currentColor`). */
function MetricIcon({ tone }: { tone: MetricCardData["tone"] }) {
  if (tone === "red") return <WalletIcon size={24} />;
  if (tone === "blue") return <ClockIcon size={24} />;
  return <StarIcon size={24} />;
}
