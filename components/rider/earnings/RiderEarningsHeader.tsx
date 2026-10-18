"use client";

import { BellIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Top header strip for /rider/earnings.
 *
 *   • Left  — title block ("Earnings" heading + 1-line sub).
 *   • Right — Available balance pill (so the rider sees the
 *             withdrawable amount up top) + a "Withdraw" CTA +
 *             bell button. The Withdraw CTA on this header is a
 *             scroll-anchor — clicking it jumps the page to the
 *             sticky bottom WithdrawBar so the rider can confirm
 *             the amount.
 *
 * Same chrome as the other rider-page headers so the role
 * dashboards read as one continuous design system.
 */
export function RiderEarningsHeader({
  availableBalance,
  onWithdrawClick,
}: {
  availableBalance: string;
  onWithdrawClick: () => void;
}) {
  const t = useT();
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex flex-col gap-1 leading-normal">
        <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          {t("rider.earnings.headerTitle")}
        </h1>
        <p className="text-[13px] text-ink-muted">
          {t("rider.earnings.headerSubtitle")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-[20px] bg-[#fff5f3] px-3 py-2 text-[12px] font-semibold text-brand md:inline-flex">
          <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />
          {t("rider.earnings.availablePill")} {availableBalance}
        </span>

        <button
          type="button"
          onClick={onWithdrawClick}
          data-action="withdraw-anchor"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 md:px-5"
        >
          {t("rider.earnings.withdrawCta")}
        </button>

        <button
          type="button"
          aria-label={t("rider.earnings.notificationsAria")}
          className="flex h-10 w-10 items-center justify-center rounded-[20px] border border-line bg-white text-ink-muted transition-colors hover:text-ink"
        >
          <BellIcon size={18} />
        </button>
      </div>
    </header>
  );
}
