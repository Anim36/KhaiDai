import type { Metadata } from "next";
import { PartnerOrdersPage } from "@/components/partner/dashboard/PartnerOrdersPage";

export const metadata: Metadata = {
  title: "Orders · KhaiDai Partner",
  description:
    "Live and historical orders for your restaurant on the KhaiDai Partner dashboard.",
};

/**
 * /partner/orders — server route delegating to the client
 * orchestrator. The orchestrator owns the tab + status-override +
 * detail-modal state machine so the route stays a thin Server
 * Component for SEO + clean metadata.
 */
export default function PartnerOrdersRoute() {
  return <PartnerOrdersPage />;
}