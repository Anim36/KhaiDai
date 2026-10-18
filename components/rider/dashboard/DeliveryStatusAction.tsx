"use client";

import {
  CheckIcon,
  ChevronRightIcon,
  MapPinIcon,
  RiderScooterIcon,
} from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Bottom-of-page action button + step indicator on the active-delivery page.
 *
 * Three stages, two advances (Feat 1 — order-flow restructure):
 *
 *   1. "Receive"            → PATCH ready → picked_up
 *      (Rider has reached the restaurant, takes possession of the food.)
 *      Previously named "Confirm Pickup"; renamed to "Receive" because
 *      the partner has already "marked ready" by the time the rider
 *      gets here, so "confirm" was misleading.
 *         ↓
 *   2. "On the way"         → PATCH picked_up → on_the_way
 *         ↓
 *   3. "Delivery Done"      ← fires `onComplete()` (rider returns to dashboard)
 *      Previously named "Mark as Delivered"; renamed to "Delivery
 *      Done" so the rider-facing copy reads naturally.
 *
 * `stage` lives in the parent orchestrator's state so the same
 * value can drive the map placeholder accent + the panel header
 * later if we want to. The step indicator on the right shows
 * "Step 1 of 3" / "Step 2 of 3" / "Step 3 of 3" so the rider
 * always knows what's next.
 */

export type DeliveryStage = "awaiting_pickup" | "en_route" | "delivered";

export const stages: DeliveryStage[] = [
  "awaiting_pickup",
  "en_route",
  "delivered",
];

type StageCopy = {
  labelKey: import("@/lib/i18n/LocaleProvider").TranslationKey;
  ctaKey: import("@/lib/i18n/LocaleProvider").TranslationKey;
  icon: "pin" | "scooter" | "check";
};

const stageCopy: Record<DeliveryStage, StageCopy> = {
  awaiting_pickup: {
    // Feat 1 — the rider is at the restaurant waiting for it to be
    // handed over. CTA renamed "Confirm Pickup" → "Receive".
    labelKey: "rider.dashboard.stage.awaiting_pickup",
    ctaKey: "rider.dashboard.stage.cta_awaiting_pickup",
    icon: "pin",
  },
  en_route: {
    labelKey: "rider.dashboard.stage.en_route",
    ctaKey: "rider.dashboard.stage.cta_en_route",
    icon: "scooter",
  },
  delivered: {
    // Feat 1 — CTA renamed "Mark as Delivered" → "Delivery Done".
    labelKey: "rider.dashboard.stage.delivered",
    ctaKey: "rider.dashboard.stage.cta_delivered",
    icon: "check",
  },
};

export function DeliveryStatusAction({
  stage,
  onAdvance,
  onComplete,
  disabled,
  variant = "inline",
}: {
  stage: DeliveryStage;
  /**
   * Bug 1 fix — the CTA fires this with the CURRENT stage, not
   * the next one. The parent then issues the PATCH using
   * `stageToApiStatus(currentStage)` (which already maps to the
   * NEXT API status) and advances local state on success. The
   * previous version forwarded the *next* stage here, which made
   * `stageToApiStatus` produce the wrong API target (e.g.
   * clicking "Confirm Pickup" while in `awaiting_pickup` sent
   * `PATCH on_the_way` instead of `PATCH picked_up`).
   */
  onAdvance: (currentStage: DeliveryStage) => void;
  onComplete: () => void;
  /** Disables the CTA while a PATCH is in flight. */
  disabled?: boolean;
  /**
   * "sticky" — render the bar as a full-width sticky footer on
   * mobile, with the CTA going to h-14 (56px) and w-full. Used
   * on the active-delivery page so the rider can advance the
   * flow with their thumb without scrolling. Desktop is the
   * same in both variants.
   */
  variant?: "inline" | "sticky";
}) {
  const copy = stageCopy[stage];
  const stepIndex = stages.indexOf(stage) + 1;
  const isFinal = stage === "delivered";
  const t = useT();

  const handleClick = () => {
    if (isFinal) {
      onComplete();
      return;
    }
    // Forward the CURRENT stage; parent maps it to the API status
    // we transition TO (see stageToApiStatus) and only then
    // advances local state on success.
    onAdvance(stage);
  };

  const isSticky = variant === "sticky";
  return (
    <div
      className={
        "flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 md:flex-row md:items-center md:justify-between" +
        (isSticky
          ? // Mobile sticky footer so the rider can advance the
            // flow with their thumb without scrolling past the
            // map / chat panel. `pb-safe` keeps the button above
            // the iOS gesture indicator; the page's bottom padding
            // (also `pb-safe`) on the outer `<main>` matches.
            " fixed inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 border-t pb-safe shadow-[0_-2px_12px_rgba(0,0,0,0.06)] md:static md:z-auto md:rounded-2xl md:border md:border-line md:pb-5 md:shadow-none"
          : "")
      }
    >
      {/* Left — current stage label + step counter (hidden on
          mobile when sticky — the button is the only thing the
          rider needs at their thumb). */}
      <div
        className={
          "flex items-center gap-3" + (isSticky ? " hidden md:flex" : "")
        }
      >
        <span
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
            (isFinal
              ? "bg-[#dcfce7] text-[#16a34a]"
              : "bg-[#fff5f3] text-brand")
          }
          aria-hidden
        >
          {copy.icon === "pin" && <MapPinIcon size={20} />}
          {copy.icon === "scooter" && <RiderScooterIcon size={20} />}
          {copy.icon === "check" && <CheckIcon size={20} />}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("rider.dashboard.stage.stepOf", { n: stepIndex, total: stages.length })}
          </span>
          <span className="text-[15px] font-semibold text-ink">
            {t(copy.labelKey)}
          </span>
        </div>
      </div>

      {/* Right — primary CTA. Sticky variant: full-width + 56px
          tall so it's a comfortable thumb target. The "Step n of
          N" hint is rendered above the button on mobile so the
          rider still knows which step they're on. */}
      <div className={"flex w-full flex-col gap-1" + (isSticky ? " md:w-auto md:flex-row md:items-center md:gap-4" : "")}>
        {isSticky ? (
          <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:hidden">
            {t("rider.dashboard.stage.stepOf", { n: stepIndex, total: stages.length })}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          data-stage={stage}
          className={
            "inline-flex items-center justify-center gap-2 rounded-xl bg-brand text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 " +
            (isSticky
              ? "h-14 w-full text-[15px] md:h-12 md:w-auto md:px-6 md:text-[14px]"
              : "h-12 px-6")
          }
        >
          {t(copy.ctaKey)}
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  );
}
