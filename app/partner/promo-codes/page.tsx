import type { Metadata } from "next";
import { PartnerPromoCodesPage } from "@/components/partner/dashboard/PartnerPromoCodesPage";

export const metadata: Metadata = {
  title: "Promo Codes · KhaiDai Partner",
  description:
    "Create, edit, and toggle promo codes for your KhaiDai Partner restaurant.",
};

/**
 * /partner/promo-codes — server route delegating to the client
 * orchestrator. The orchestrator owns the list + create-form state
 * machine so the route stays a thin Server Component for SEO + clean
 * metadata.
 */
export default function PartnerPromoCodesRoute() {
  return <PartnerPromoCodesPage />;
}
