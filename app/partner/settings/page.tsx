import type { Metadata } from "next";
import { PartnerSettingsPage } from "@/components/partner/dashboard/PartnerSettingsPage";

export const metadata: Metadata = {
  title: "Settings · KhaiDai Partner",
  description:
    "Manage your restaurant profile, contact info, and notification preferences on KhaiDai Partner.",
};

/**
 * /partner/settings — server route delegating to the client
 * orchestrator. The orchestrator owns the form state + save flow so
 * the route stays a thin Server Component for SEO + clean metadata.
 */
export default function PartnerSettingsRoute() {
  return <PartnerSettingsPage />;
}