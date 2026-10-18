import type { Metadata } from "next";
import { RiderSettingsPage } from "@/components/rider/settings/RiderSettingsPage";

export const metadata: Metadata = {
  title: "Settings · KhaiDai Rider",
  description:
    "Manage your KhaiDai Rider profile, vehicle info, payout method, and notification preferences.",
};

/**
 * /rider/settings — server route delegating to the client
 * orchestrator. The orchestrator owns the form state + save
 * state machine + logout handler so the route stays a thin
 * Server Component for SEO + clean metadata.
 */
export default function RiderSettingsRoute() {
  return <RiderSettingsPage />;
}
