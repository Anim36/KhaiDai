"use client";

import {
  ClockIcon,
  StarIcon,
  WalletIcon,
} from "@/components/icons";
import {
  type EarningsSummaryCard,
} from "@/components/partner/dashboard/usePartnerEarnings";
import { useT } from "@/lib/i18n/LocaleProvider";

export function EarningsSummaryRow({
  cards,
}: {
  cards: EarningsSummaryCard[];
}) {
  const t = useT();
  if (cards.length === 0) return null;
  return (
    <section
      aria-label={t("partner.earnings.summary.netEarnings")}
      className="flex flex-col gap-6 lg:flex-row lg:items-stretch"
    >
      {cards.map((card) => (
        <SummaryCard key={card.id} card={card} />
      ))}
    </section>
  );
}

function SummaryCard({ card }: { card: EarningsSummaryCard }) {
  const t = useT();
  const label = t(card.labelKey as Parameters<typeof t>[0]);
  const caption = card.captionKey
    ? t(card.captionKey as Parameters<typeof t>[0])
    : "—";
  return (
    <article className="flex flex-1 items-center justify-between rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-col gap-2 leading-normal">
        <span className="text-[13px] text-ink-muted">{label}</span>
        <span className="font-display text-[26px] font-extrabold text-ink leading-none">
          {card.value}
        </span>
        <span className="text-[12px] text-ink-muted">{caption}</span>
      </div>
      <span
        aria-hidden
        className={
          "flex h-12 w-12 items-center justify-center rounded-xl " +
          toneClass(card.tone)
        }
      >
        <SummaryIcon tone={card.tone} />
      </span>
    </article>
  );
}

function toneClass(tone: EarningsSummaryCard["tone"]) {
  switch (tone) {
    case "red":
      return "bg-[rgba(255,77,48,0.12)] text-brand";
    case "blue":
      return "bg-[rgba(59,130,246,0.12)] text-[#3b82f6]";
    case "yellow":
      return "bg-[rgba(255,149,0,0.12)] text-[#ff9500]";
  }
}

function SummaryIcon({ tone }: { tone: EarningsSummaryCard["tone"] }) {
  if (tone === "red") return <WalletIcon size={24} />;
  if (tone === "blue") return <ClockIcon size={24} />;
  return <StarIcon size={24} />;
}
