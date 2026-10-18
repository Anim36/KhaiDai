import type { Metadata } from "next";
import { PartnerReviewsPage } from "@/components/partner/dashboard/PartnerReviewsPage";

export const metadata: Metadata = {
  title: "Reviews · KhaiDai Partner",
  description:
    "See what customers are saying about your restaurant, and reply directly from the KhaiDai Partner dashboard.",
};

/**
 * /partner/reviews — server route that delegates to the client
 * orchestrator. Each review card owns its own reply state so the
 * orchestrator stays pure presentation.
 */
export default function PartnerReviewsRoute() {
  return <PartnerReviewsPage />;
}