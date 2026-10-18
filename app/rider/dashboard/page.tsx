import type { Metadata } from "next";
import { RiderDashboardPage } from "@/components/rider/dashboard/RiderDashboardPage";

export const metadata: Metadata = {
  title: "Dashboard · KhaiDai Rider",
  description:
    "Go online, accept delivery requests, and track today's earnings on the KhaiDai Rider dashboard.",
};

/**
 * /rider/dashboard — server route delegating to the client
 * orchestrator. The orchestrator owns the online toggle, the
 * incoming-request queue, the Accept / Decline handlers, and the
 * today's summary card so the route stays a thin Server Component
 * for SEO + clean metadata.
 */
export default function RiderDashboardRoute() {
  return <RiderDashboardPage />;
}
