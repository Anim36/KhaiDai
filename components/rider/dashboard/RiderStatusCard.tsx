"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  CircleXIcon,
  MapPinIcon,
  WalletIcon,
} from "@/components/icons";
import type { DeliveryRequest } from "@/data/rider-dashboard";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Status area on the rider dashboard — switches between three modes:
 *
 *   1. Offline — empty-state panel that prompts the rider to go
 *      online.
 *   2. Online, no offers — "all caught up" state.
 *   3. Online, has offer  — incoming-request card showing pickup /
 *      drop-off, distance, ETA, earnings, and Accept / Decline
 *      actions. When the parent passes a `deadline` the card renders
 *      a live countdown badge so the rider knows how long they have
 *      before the system offers the order to the next rider.
 *
 * Accept navigates to /rider/delivery/{id} (the upcoming route).
 * Decline pops the head request off the pool so the parent can
 * push the next one in. Both callbacks come in via props so this
 * component stays presentational.
 */
export function RiderStatusCard({
  online,
  request,
  onAccept,
  onDecline,
  hasMoreRequests,
  loading,
  acceptingId,
  deadline,
}: {
  online: boolean;
  request: DeliveryRequest | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  /** True when the pool still has another request waiting. */
  hasMoreRequests: boolean;
  /** Show a skeleton while the first poll is in flight. */
  loading?: boolean;
  /** Highlight which Accept button is mid-flight (server round-trip). */
  acceptingId?: string | null;
  /** ISO timestamp the offer expires. Optional — older builds of the
   *  dispatch flow may not set one. */
  deadline?: string | null;
}) {
  if (!online) return <OfflineState />;
  if (loading && !request) return <LoadingState />;
  if (!request) return <NoRequestsState />;
  return (
    <RequestCard
      request={request}
      onAccept={onAccept}
      onDecline={onDecline}
      hasMore={hasMoreRequests}
      accepting={acceptingId === request.id}
      deadline={deadline ?? null}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Offline empty-state                                                       */
/* -------------------------------------------------------------------------- */

function OfflineState() {
  const t = useT();
  return (
    <div
      data-state="offline"
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff5f3] text-brand">
        <MapPinIcon size={26} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] font-extrabold text-ink">
          {t("rider.dashboard.offlineHeading")}
        </h2>
        <p className="max-w-sm text-[14px] font-normal text-ink-muted leading-[1.5]">
          {t("rider.dashboard.offlineSubtitle")}
        </p>
      </div>
    </div>
  );
}

function NoRequestsState() {
  const t = useT();
  return (
    <div
      data-state="no-requests"
      className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-white px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff5f3] text-brand">
        <CheckIcon size={26} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] font-extrabold text-ink">
          {t("rider.dashboard.caughtUpHeading")}
        </h2>
        <p className="max-w-sm text-[14px] font-normal text-ink-muted leading-[1.5]">
          {t("rider.dashboard.caughtUpSubtitle")}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Incoming request card                                                     */
/* -------------------------------------------------------------------------- */

function RequestCard({
  request,
  onAccept,
  onDecline,
  hasMore,
  accepting,
  deadline,
}: {
  request: DeliveryRequest;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  hasMore: boolean;
  accepting?: boolean;
  deadline?: string | null;
}) {
  const t = useT();
  // Live countdown to `deadline` (ms-remaining string). When the
  // timer hits zero we don't auto-fall-through — the parent will
  // poll and the server will re-offer to the next rider. We just
  // surface "0s" / "Expired" copy so the UI matches the backend.
  const deadlineMs = deadline ? new Date(deadline).getTime() : null;
  const [remainingMs, setRemainingMs] = useState<number | null>(
    deadlineMs !== null ? Math.max(0, deadlineMs - Date.now()) : null,
  );
  useEffect(() => {
    if (deadlineMs === null) {
      setRemainingMs(null);
      return;
    }
    setRemainingMs(Math.max(0, deadlineMs - Date.now()));
    const t = setInterval(() => {
      const next = Math.max(0, deadlineMs - Date.now());
      setRemainingMs(next);
      if (next === 0) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [deadlineMs]);

  return (
    <article
      data-state="incoming-request"
      data-request-id={request.id}
      className="flex flex-col gap-6 rounded-2xl border border-line bg-white p-6"
    >
      {/* Header — order id + earnings badge (+ countdown when dispatch set one) */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("rider.dashboard.incomingRequestLabel")}
          </span>
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {request.shortId}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {remainingMs !== null ? (
            <CountdownBadge ms={remainingMs} />
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-[20px] bg-[#fff5f3] px-3 py-1.5 text-[13px] font-semibold text-brand">
            <WalletIcon size={14} />
            {request.earnings}
          </span>
        </div>
      </header>

      {/* Trip details — pickup / drop-off / stats */}
      <div className="flex flex-col gap-4">
        <StopRow
          kind="pickup"
          label={t("rider.dashboard.incomingPickup")}
          place={request.pickupName}
          address={request.pickupAddress}
        />
        <StopRow
          kind="dropoff"
          label={t("rider.dashboard.incomingDropOff")}
          place={request.dropoffName}
          address={request.dropoffAddress}
        />

        {/* Trip stats — distance + ETA + items */}
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat label={t("rider.dashboard.incomingDistance")} value={request.distance} />
          <Stat label={t("rider.dashboard.incomingEta")} value={request.eta} />
          <Stat label={t("rider.dashboard.incomingItems")} value={request.itemSummary} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        <button
          type="button"
          onClick={() => onDecline(request.id)}
          disabled={accepting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-50"
        >
          <CircleXIcon size={18} />
          {t("rider.dashboard.incomingDecline")}
        </button>
        <button
          type="button"
          onClick={() => onAccept(request.id)}
          disabled={accepting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <CheckIcon size={18} />
          {accepting
            ? t("rider.dashboard.incomingAccepting")
            : t("rider.dashboard.incomingAccept")}
        </button>
      </div>

      {!hasMore ? (
        <p className="text-center text-[12px] text-ink-muted">
          {t("rider.dashboard.lastInQueue")}
        </p>
      ) : null}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Loading state                                                             */
/* -------------------------------------------------------------------------- */

function LoadingState() {
  return (
    <div
      data-state="loading"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6"
    >
      <div className="h-6 w-1/3 animate-pulse rounded bg-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-surface" />
      <div className="h-12 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function StopRow({
  kind,
  label,
  place,
  address,
}: {
  kind: "pickup" | "dropoff";
  label: string;
  place: string;
  address: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
          (kind === "pickup"
            ? "bg-[#fff5f3] text-brand"
            : "bg-[#fff7e6] text-[#f59e0b]")
        }
        aria-hidden
      >
        <MapPinIcon size={16} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className="text-[14px] font-semibold text-ink">{place}</span>
        <span className="text-[12px] font-normal text-ink-muted">
          {address}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="font-display text-[16px] font-extrabold text-ink">
        {value}
      </span>
    </div>
  );
}

/**
 * Inline countdown badge for the dispatch offer. Renders the seconds
 * left (or "Expired" when the timer has lapsed). The parent already
 * owns polling for the next offer, so this badge is read-only.
 */
function CountdownBadge({ ms }: { ms: number }) {
  const t = useT();
  const totalSeconds = Math.ceil(ms / 1000);
  const expired = ms <= 0;
  return (
    <span
      data-offer-countdown={totalSeconds}
      className={
        "inline-flex items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-semibold " +
        (expired
          ? "bg-rose-100 text-rose-700"
          : "bg-amber-100 text-amber-800")
      }
    >
      <span aria-hidden className="block h-2 w-2 rounded-full bg-current" />
      {expired ? t("rider.dashboard.incomingExpired") : `${totalSeconds}s`}
    </span>
  );
}
