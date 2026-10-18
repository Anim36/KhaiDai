import { PartnerAnalyticsPage } from "@/components/partner/dashboard/PartnerAnalyticsPage";

/**
 * /partner/analytics — partner sales analytics + reports.
 *
 * Feat 1 — Partner Analytics / Reports. The actual UI lives in
 * `<PartnerAnalyticsPage />` (a client component) because the
 * date range selector needs React state, the chart re-fetches
 * on every range change, and CSV export runs in the browser.
 */
export default function Page() {
  return <PartnerAnalyticsPage />;
}