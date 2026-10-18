"use client";

import type {
  EarningsTransaction as EarningsTxn,
} from "@/components/partner/dashboard/usePartnerEarnings";
import { useT } from "@/lib/i18n/LocaleProvider";

export function TransactionsTable({
  transactions,
}: {
  transactions: EarningsTxn[];
}) {
  const t = useT();
  return (
    <section
      aria-label={t("partner.earnings.transactions.title")}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("partner.earnings.transactions.title")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("partner.earnings.transactions.subtitle")}
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#f9fafb] text-[12px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">{t("partner.earnings.transactions.columns.date")}</th>
              <th className="px-4 py-3">{t("partner.earnings.transactions.columns.order")}</th>
              <th className="px-4 py-3 text-right">{t("partner.earnings.transactions.columns.amount")}</th>
              <th className="px-4 py-3">{t("partner.earnings.transactions.columns.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-[12px] text-ink-muted"
                >
                  {t("partner.earnings.transactions.empty")}
                </td>
              </tr>
            ) : (
              transactions.map((txn) => (
                <TransactionRow key={txn.id} txn={txn} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionRow({ txn }: { txn: EarningsTxn }) {
  const t = useT();
  return (
    <tr className="text-ink">
      <td className="px-4 py-3 text-ink-muted">{txn.date}</td>
      <td className="px-4 py-3 font-bold">{txn.orderId}</td>
      <td className="px-4 py-3 text-right font-extrabold">{txn.amount}</td>
      <td className="px-4 py-3">
        <span
          className={
            "inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold " +
            (txn.status === "paid"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700")
          }
        >
          {txn.status === "paid" ? t("partner.earnings.transactions.status.PAID") : t("partner.earnings.transactions.status.PENDING")}
        </span>
      </td>
    </tr>
  );
}