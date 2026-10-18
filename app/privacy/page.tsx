import type { Metadata } from "next";
import { PrivacyPage } from "@/components/legal/PrivacyPage";

export const metadata: Metadata = {
  title: "Privacy Policy · KhaiDai",
  description:
    "How KhaiDai collects, uses, and protects your personal data — read our full privacy policy.",
};

/**
 * /privacy — server route delegating to the orchestrator.
 */
export default function PrivacyRoute() {
  return <PrivacyPage />;
}
