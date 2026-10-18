import type { Metadata } from "next";
import { TermsPage } from "@/components/legal/TermsPage";

export const metadata: Metadata = {
  title: "Terms of Service · KhaiDai",
  description:
    "Read KhaiDai's Terms of Service — what we expect from you, what you can expect from us, and how disputes are handled.",
};

/**
 * /terms — server route delegating to the orchestrator.
 */
export default function TermsRoute() {
  return <TermsPage />;
}
