import type { Metadata } from "next";
import { RiderHelpPage } from "@/components/rider/help/RiderHelpPage";

export const metadata: Metadata = {
  title: "Help & Support · KhaiDai Rider",
  description:
    "Get answers to common rider questions, contact support, or report an issue on the KhaiDai Rider panel.",
};

/**
 * /rider/help — server route delegating to the client
 * orchestrator. The orchestrator owns the FAQ accordion state +
 * the report-issue submit flow so the route stays a thin Server
 * Component for SEO + clean metadata.
 */
export default function RiderHelpRoute() {
  return <RiderHelpPage />;
}
