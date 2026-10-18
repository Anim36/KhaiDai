"use client";

import { useEffect } from "react";
import {
  ClockIcon,
  MapPinIcon,
  RiderScooterIcon,
  WalletIcon,
} from "@/components/icons";
import type { CompletedTrip } from "@/data/rider-history";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Trip-detail modal — opened from the history table when the
 * rider taps a row.
 *
 * Surfaces the full info that doesn't fit on the row:
 *   • Order short id + status pill + placed-at timestamp
 *   • Pickup + drop-off blocks (restaurant / customer + address)
 *   • Trip stats (distance / duration / earned / payment)
 *   • Cancellation reason when status === "cancelled"
 *
 * Escape-to-close + click-outside-to-close both wired.
 */
export function TripDetailModal({
  trip,
  onClose,
}: {
  trip: CompletedTrip | null;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    if (!trip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trip, onClose]);

  if (!trip) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] max-h-[90dvh] overflow-y-auto rounded-3xl border border-line bg-white p-6 flex flex-col gap-5 shadow-xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {t("rider.history.modal.tripLabel")}
            </span>
            <h2
              id="trip-detail-title"
              className="font-display text-[22px] font-extrabold text-ink"
            >
              {trip.shortId}
            </h2>
            <span className="text-[12px] text-ink-muted">
              {trip.placedAtLabel}
            </span>
          </div>
          <StatusPill status={trip.status} />
        </header>

        <div className="h-px w-full bg-line" aria-hidden />

        {/* Pickup + drop-off */}
        <section className="flex flex-col gap-4">
          <StopRow
            tone="brand"
            label={t("rider.history.modal.pickup")}
            place={trip.restaurant}
            address={t("rider.history.paymentFallback")}
          />
          <StopRow
            tone="amber"
            label={t("rider.history.modal.dropoff")}
            place={trip.customer}
            address={trip.customerAddress}
            extra={trip.customerPhone}
          />
        </section>

        <div className="h-px w-full bg-line" aria-hidden />

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("rider.history.modal.distance")} value={trip.distance} />
          <Stat label={t("rider.history.modal.duration")} value={trip.duration} />
          <Stat label={t("rider.history.modal.payment")} value={trip.payment} />
          <Stat label={t("rider.history.modal.earned")} value={trip.earned} />
        </section>

        {trip.cancellationReason ? (
          <div
            data-cancellation-reason
            className="flex flex-col gap-1 rounded-xl bg-[#fef2f2] px-4 py-3"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">
              {t("rider.history.modal.cancellationReason")}
            </span>
            <span className="text-[13px] text-ink">
              {trip.cancellationReason}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          ← {t("rider.history.modal.backToHistory")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
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
        "inline-flex items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[12px] font-semibold " +
        meta.classes
      }
    >
      {status === "delivered"
        ? t("rider.history.statusDelivered")
        : t("rider.history.statusCancelled")}
    </span>
  );
}

function StopRow({
  tone,
  label,
  place,
  address,
  extra,
}: {
  tone: "brand" | "amber";
  label: string;
  place: string;
  address: string;
  extra?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
          (tone === "brand"
            ? "bg-[#fff5f3] text-brand"
            : "bg-[#fff7e6] text-[#f59e0b]")
        }
        aria-hidden
      >
        {tone === "brand" ? (
          <RiderScooterIcon size={18} />
        ) : (
          <MapPinIcon size={18} />
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className="text-[15px] font-semibold text-ink">{place}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          <MapPinIcon size={12} />
          {address}
        </span>
        {extra ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
            <ClockIcon size={12} />
            {extra}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface px-3 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="inline-flex items-center gap-1.5 font-display text-[14px] font-extrabold text-ink">
        {label === "Earned" || label === "Payment" ? (
          <WalletIcon size={14} />
        ) : null}
        {value}
      </span>
    </div>
  );
}
