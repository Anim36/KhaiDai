import type { Metadata } from "next";
import { HelpPage } from "@/components/help/HelpPage";

export const metadata: Metadata = {
  title: "Help Center · KhaiDai",
  description:
    "Find answers to common KhaiDai questions or contact our support team for help with orders, payments, and accounts.",
};

/**
 * /help — server route delegating to the client orchestrator.
 */
export default function HelpRoute() {
  return <HelpPage />;
}
