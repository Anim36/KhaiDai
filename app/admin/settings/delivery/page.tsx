import type { Metadata } from "next";
import { AdminDeliverySettingsPage } from "@/components/admin/dashboard/AdminDeliverySettingsPage";

export const metadata: Metadata = {
  title: "Delivery Settings · Admin · KhaiDai",
  description:
    "Platform-wide delivery fee configuration (base fee, per-km rate, min/max, rider share). Edits are audit-logged.",
};

/**
 * /admin/settings/delivery — server route delegating to the
 * client orchestrator.
 */
export default function AdminDeliveryRoute() {
  return <AdminDeliverySettingsPage />;
}
