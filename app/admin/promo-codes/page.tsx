import type { Metadata } from "next";
import { AdminPromoCodesPage } from "@/components/admin/dashboard/AdminPromoCodesPage";

export const metadata: Metadata = {
  title: "Promo Codes · KhaiDai Admin",
  description:
    "Manage every promo code on KhaiDai — platform-wide and partner-created — from a single dashboard: activate, deactivate, audit.",
};

/**
 * /admin/promo-codes — server route delegating to the client
 * orchestrator.
 */
export default function AdminPromoCodesRoute() {
  return <AdminPromoCodesPage />;
}
