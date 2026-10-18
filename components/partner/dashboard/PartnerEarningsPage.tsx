"use client";

import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { PartnerEarningsHeader } from "@/components/partner/dashboard/PartnerEarningsHeader";
import { EarningsSummaryRow } from "@/components/partner/dashboard/EarningsSummaryRow";
import { RevenueChart } from "@/components/partner/dashboard/RevenueChart";
import { TransactionsTable } from "@/components/partner/dashboard/TransactionsTable";
import { PayoutDetails } from "@/components/partner/dashboard/PayoutDetails";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { usePartnerEarnings } from "@/components/partner/dashboard/usePartnerEarnings";

/**
 * Orchestrator for /partner/earnings.
 *
 * Layout mirrors the Figma `partner-earnings` frame:
 *   • Page background `#f9fafb`.
 *   • Two-column shell: 260px sidebar (white) + flex-1 main column.
 *   • Main column = white header strip + 32px-padded body.
 *   • Body = 32px vertical gap stacking the 3-card summary row, the
 *     revenue chart, the transactions table, and the payout card.
 *
 * All four panels are now driven by `/api/partner/earnings` (the
 * `usePartnerEarnings` hook) so a delivered order shows up the
 * moment the customer hits DELIVERED, no manual demo data.
 */
export function PartnerEarningsPage() {
  return (
    <RequireAuth role="PARTNER">
      <PartnerEarningsContent />
    </RequireAuth>
  );
}

function PartnerEarningsContent() {
  const { state, refresh } = usePartnerEarnings();

  return (
    <PartnerShell activeKey="earnings">
      <PartnerEarningsHeader />

      <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8">
          {/* Loading / empty / error states are rendered inline so the
              page chrome (sidebar + header) stays stable. */}
          {state.kind === "loading" ? (
            <LoadingState />
          ) : state.kind === "error" ? (
            <ErrorState
              message={state.message}
              onRetry={() => {
                refresh().catch(() => {});
              }}
            />
          ) : state.kind === "empty" ? (
            <EmptyState />
          ) : (
            <>
              {/* Top row: Today's / This Week / This Month */}
              <EarningsSummaryRow cards={state.data.summaryCards} />

              {/* Revenue chart card */}
              <RevenueChart data={state.data.dailyRevenue} />

              {/* Transactions table */}
              <TransactionsTable transactions={state.data.transactions} />

              {/* Payout details + Request CTA */}
              <PayoutDetails
                balance={state.data.balance}
                minPayout={state.data.minPayout}
                canRequestPayout={state.data.canRequestPayout}
                payouts={state.data.payouts}
                onSuccess={refresh}
              />
            </>
          )}
        </div>
    </PartnerShell>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-2 py-16 text-center">
      <span className="font-display text-[14px] font-extrabold text-ink">
        Loading earnings…
      </span>
      <p className="text-[12px] text-ink-muted">
        Aggregating your orders and payout history.
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="font-display text-[14px] font-extrabold text-ink">
        Couldn&apos;t load earnings
      </span>
      <p className="max-w-sm text-[12px] text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="h-10 rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink hover:bg-surface"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-2 py-16 text-center">
      <span className="font-display text-[14px] font-extrabold text-ink">
        No restaurant yet
      </span>
      <p className="max-w-sm text-[12px] text-ink-muted">
        Create your restaurant from the dashboard first; once an order
        lands, your earnings show up here automatically.
      </p>
    </div>
  );
}
