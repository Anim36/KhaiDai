import type { Metadata } from "next";
import { PartnerDashboardPage } from "@/components/partner/dashboard/PartnerDashboardPage";

export const metadata: Metadata = {
  title: "Partner Dashboard · KhaiDai",
  description:
    "Manage incoming orders, track today's revenue, and monitor your restaurant's performance on KhaiDai Partner.",
};

/**
 * /partner/dashboard — server route that delegates to the client
 * orchestrator. The orchestrator owns the order-status state machine,
 * so the route stays a thin Server Component for SEO + clean metadata.
 */
export default function PartnerDashboardRoute() {
  return <PartnerDashboardPage />;
}