import type { Metadata } from "next";
import { PartnerEarningsPage } from "@/components/partner/dashboard/PartnerEarningsPage";

export const metadata: Metadata = {
  title: "Earnings · KhaiDai Partner",
  description:
    "Track your restaurant's revenue, payouts, and recent transactions on the KhaiDai Partner earnings dashboard.",
};

/**
 * /partner/earnings — server route that delegates to the client
 * orchestrator. The orchestrator owns no state of its own (the
 * individual chart / payout components do) so this route stays a
 * thin Server Component for SEO + clean metadata.
 */
export default function PartnerEarningsRoute() {
  return <PartnerEarningsPage />;
}