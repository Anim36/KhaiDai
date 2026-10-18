import type { Metadata } from "next";
import { PartnerRegisterPageClient } from "@/components/partner/PartnerRegisterPageClient";

export const metadata: Metadata = {
  title: "Become a Partner · KhaiDai",
  description:
    "Register your restaurant on KhaiDai to reach thousands of hungry customers across Dhaka.",
};

/**
 * /partner/register — server-route delegating to the client wrapper
 * (the wrapper owns the tab-pill state machine).
 */
export default function PartnerRegisterPage() {
  return <PartnerRegisterPageClient />;
}
