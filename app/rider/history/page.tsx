import type { Metadata } from "next";
import { RiderHistoryPage } from "@/components/rider/history/RiderHistoryPage";

export const metadata: Metadata = {
  title: "Trip History · KhaiDai Rider",
  description:
    "Browse all completed and cancelled KhaiDai delivery trips, filter by date range, and view full trip details.",
};

/**
 * /rider/history — server route delegating to the client
 * orchestrator. The orchestrator owns the tab filter, the
 * detail-modal state, and the row click handler so the route
 * stays a thin Server Component for SEO + clean metadata.
 */
export default function RiderHistoryRoute() {
  return <RiderHistoryPage />;
}
