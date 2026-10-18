"use client";

import {
  BanknoteIcon,
  CheckIcon,
  ClockIcon,
  CreditCardIcon,
  MapPinIcon,
  WalletIcon,
} from "@/components/icons";
import type { CompletedTrip } from "@/data/rider-history";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Single history row.
 *
 *   • Desktop: 6-column grid table — shortId / Date / Trip /
 *     Distance / Status / Earned. Header strip on md+.
 *   • Mobile:  each row collapses to a stacked card so the layout
 *     stays legible on phones.
 *
 * Each row is wrapped in a real `<button>` so keyboard users get
 * focus + Enter for free. Clicking the row surfaces the detail
 * modal via the parent's `onOpen` callback.
 */
export function TripHistoryCard({
  trips,
  onOpen,
}: {
  trips: CompletedTrip[];
  onOpen: (id: string) => void;
}) {
  const t = useT();
  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
        <span className="font-display text-[16px] font-extrabold text-ink">
          {t("rider.history.filteredEmptyTitle")}
        </span>
        <p className="text-[13px] text-ink-muted">
          {t("rider.history.filteredEmptyBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Column headers — desktop only */}
      <div className="hidden gap-3 px-4 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[100px_1.4fr_1.8fr_120px_120px_120px]">
        <span>{t("rider.history.columnOrder")}</span>
        <span>{t("rider.history.columnDate")}</span>
        <span>{t("rider.history.columnTrip")}</span>
        <span>{t("rider.history.columnDistance")}</span>
        <span>{t("rider.history.columnStatus")}</span>
        <span className="text-right">{t("rider.history.columnEarned")}</span>
      </div>

      <ul className="flex flex-col gap-3">
        {trips.map((trip) => (
          <li key={trip.id}>
            <HistoryRow trip={trip} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({
  trip,
  onOpen,
}: {
  trip: CompletedTrip;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onOpen(trip.id)}
      data-trip-id={trip.id}
      data-trip-status={trip.status}
      aria-label={t("rider.history.openAria", { shortId: trip.shortId })}
      className="grid w-full grid-cols-1 gap-y-3 rounded-2xl border border-line bg-white p-4 text-left transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:grid-cols-[100px_1.4fr_1.8fr_120px_120px_120px] md:items-center md:gap-3"
    >
      {/* Order id */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("rider.history.columnOrder")}
        </span>
        <span className="font-display text-[14px] font-extrabold text-ink">
          {trip.shortId}
        </span>
      </div>

      {/* Date / time */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("rider.history.columnDate")}
        </span>
        <span className="text-[13px] text-ink">{trip.placedAtLabel}</span>
      </div>

      {/* Trip */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("rider.history.columnTrip")}
        </span>
        <span className="text-[14px] font-semibold text-ink truncate">
          {trip.restaurant}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          <MapPinIcon size={12} />
          <span className="truncate">{trip.customerAddress}</span>
        </span>
        <PaymentBadge method={trip.payment} />
      </div>

      {/* Distance */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("rider.history.columnDistance")}
        </span>
        <span className="text-[14px] text-ink">{trip.distance}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          <ClockIcon size={12} />
          {trip.duration}
        </span>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("rider.history.columnStatus")}
        </span>
        <StatusPill status={trip.status} />
      </div>

      {/* Earned */}
      <div className="flex flex-col items-start gap-0.5 md:items-end">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
          {t("rider.history.columnEarned")}
        </span>
        <span className="font-display text-[14px] font-extrabold text-brand">
          {trip.earned}
        </span>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status pill                                                               */
/* -------------------------------------------------------------------------- */

const statusMeta = {
  delivered: {
    classes: "bg-[#dcfce7] text-[#16a34a]",
  },
  cancelled: {
    classes: "bg-[#fef2f2] text-rose-500",
  },
} as const;

function StatusPill({ status }: { status: CompletedTrip["status"] }) {
  const t = useT();
  const meta = statusMeta[status];
  return (
    <span
      data-status={status}
      className={
        "inline-flex w-fit items-center gap-1.5 rounded-[20px] px-3 py-1 text-[12px] font-semibold " +
        meta.classes
      }
    >
      {status === "delivered" ? (
        <CheckIcon size={12} />
      ) : (
        <CircleXSmall />
      )}
      {status === "delivered"
        ? t("rider.history.statusDelivered")
        : t("rider.history.statusCancelled")}
    </span>
  );
}

function CircleXSmall() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="6" cy="6" r="5" />
      <path d="M4 4L8 8M8 4L4 8" />
    </svg>
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

function PaymentBadge({ method }: { method: CompletedTrip["payment"] }) {
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
