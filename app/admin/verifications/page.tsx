import type { Metadata } from "next";
import { AdminVerificationsPage } from "@/components/admin/dashboard/AdminVerificationsPage";

export const metadata: Metadata = {
  title: "Verifications · KhaiDai Admin",
  description:
    "Review restaurant and rider verification applications on KhaiDai Admin.",
};

/**
 * /admin/verifications — server route that delegates to the
 * client orchestrator. The orchestrator owns the tabs + list
 * state, so this route stays a thin Server Component for SEO
 * and clean metadata.
 */
export default function AdminVerificationsRoute() {
  return <AdminVerificationsPage />;
}