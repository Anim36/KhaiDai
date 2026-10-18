import type { Metadata } from "next";
import { RiderEarningsPage } from "@/components/rider/earnings/RiderEarningsPage";

export const metadata: Metadata = {
  title: "Earnings · KhaiDai Rider",
  description:
    "Track today's, weekly, and monthly rider earnings, browse your trip history, and cash out your available balance.",
};

/**
 * /rider/earnings — server route delegating to the client
 * orchestrator. The orchestrator owns the chart range state, the
 * scroll-anchor for the header Withdraw CTA, and the WithdrawBar's
 * success/pending state machine so the route stays a thin Server
 * Component for SEO + clean metadata.
 */
export default function RiderEarningsRoute() {
  return <RiderEarningsPage />;
}
