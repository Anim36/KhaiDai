"use client";

import {
  BanknoteIcon,
  CheckIcon,
  ClockIcon,
  CreditCardIcon,
  WalletIcon,
} from "@/components/icons";
import type { CashOutRow, TripHistoryRow } from "@/data/rider-earnings";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Bottom-of-page trip-history list.
 *
 *   • Desktop: 5-column grid table — Date / Trip / Distance /
 *     Duration / Earned. Header strip uses uppercase muted text
 *     so the layout reads as a proper table on wide screens.
 *   • Mobile: each row collapses to a 2-column stacked card so
 *     the layout stays legible on phones.
 *
 * Each row carries a payment-method badge (bKash / Cash / Card)
 * using the same colour language as the dashboard's OrderStatusPill
 * — green for bKash, neutral for Cash, brand for Card.
 */
export function TripHistoryList({ trips }: { trips: TripHistoryRow[] }) {
  const t = useT();
  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
        <span className="font-display text-[16px] font-extrabold text-ink">
          {t("rider.earnings.tripEmpty")}
        </span>
        <p className="text-[13px] text-ink-muted">
          {t("rider.earnings.tripEmptyBody")}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label={t("rider.earnings.tripHistoryTitle")}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.earnings.tripHistoryTitle")}
        </h2>
        <span className="text-[12px] text-ink-muted">
          {t("rider.earnings.tripHistoryCount", { n: trips.length })}
        </span>
      </header>

      {/* Column headers — desktop only */}
      <div className="hidden gap-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[1.2fr_1.8fr_1fr_1fr_1.2fr]">
        <span>{t("rider.earnings.tripColumnDate")}</span>
        <span>{t("rider.earnings.tripColumnTrip")}</span>
        <span>{t("rider.earnings.tripColumnDistance")}</span>
        <span>{t("rider.earnings.tripColumnDuration")}</span>
        <span className="text-right">
          {t("rider.earnings.tripColumnEarned")}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {trips.map((t) => (
          <li key={t.id}>
            <TripRow trip={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row                                                                       */
/* -------------------------------------------------------------------------- */

function TripRow({ trip }: { trip: TripHistoryRow }) {
  return (
    <article
      data-trip-id={trip.id}
      className="grid w-full grid-cols-1 gap-y-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-[1.2fr_1.8fr_1fr_1fr_1.2fr] md:items-center md:gap-3"
    >
      {/* Date / time */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          Date / Time
        </span>
        <span className="font-display text-[14px] font-extrabold text-ink">
          {trip.shortWhen}
        </span>
        <span className="text-[12px] text-ink-muted">{trip.when}</span>
      </div>

      {/* Trip — restaurant → customer + payment badge */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          Trip
        </span>
        <span className="text-[14px] font-semibold text-ink truncate">
          {trip.restaurant} → {trip.customer}
        </span>
        <PaymentBadge method={trip.payment} />
      </div>

      {/* Distance */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          Distance
        </span>
        <span className="text-[14px] text-ink">{trip.distance}</span>
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          Duration
        </span>
        <span className="inline-flex items-center gap-1.5 text-[14px] text-ink">
          <ClockIcon size={14} />
          {trip.duration}
        </span>
      </div>

      {/* Earned */}
      <div className="flex flex-col items-start gap-0.5 md:items-end">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          Earned
        </span>
        <span className="font-display text-[16px] font-extrabold text-brand">
          {trip.earned}
        </span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payment badge                                                             */
/* -------------------------------------------------------------------------- */

const paymentStyles = {
  bKash: { bg: "bg-[#fff5f3]", text: "text-brand", icon: <WalletIcon size={12} /> },
  Cash: { bg: "bg-[#fff7e6]", text: "text-[#f59e0b]", icon: <BanknoteIcon size={12} /> },
  Card: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]", icon: <CreditCardIcon size={12} /> },
} as const;

function PaymentBadge({ method }: { method: TripHistoryRow["payment"] }) {
  const s = paymentStyles[method];
  return (
    <span
      data-payment={method}
      className={
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
        s.bg +
        " " +
        s.text
      }
    >
      {s.icon}
      {method}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cash-out history                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Compact withdrawal log rendered at the very bottom of the page
 * so the rider can confirm previous payouts landed. Reuses the
 * same row geometry as the trip history for visual continuity.
 */
export function CashOutHistory({ rows }: { rows: CashOutRow[] }) {
  const t = useT();
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={t("rider.earnings.cashOutHistoryAria")}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.earnings.cashOutHistoryTitle")}
        </h2>
        <span className="text-[12px] text-ink-muted">
          {t("rider.earnings.cashOutCount", { n: rows.length })}
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-ink">
                {r.amount}
              </span>
              <span className="text-[12px] text-ink-muted truncate">
                {r.method} · {r.when}
              </span>
            </div>
            <span
              data-cashout-status={r.status}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                (r.status === "completed"
                  ? "bg-[#dcfce7] text-[#16a34a]"
                  : "bg-[#fff7e6] text-[#f59e0b]")
              }
            >
              <CheckIcon size={12} />
              {r.status === "completed"
                ? t("rider.earnings.cashOutCompleted")
                : t("rider.earnings.cashOutPending")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
