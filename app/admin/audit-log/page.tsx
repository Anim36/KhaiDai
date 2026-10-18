import type { Metadata } from "next";
import { AdminAuditLogPage } from "@/components/admin/dashboard/AdminAuditLogPage";

export const metadata: Metadata = {
  title: "Audit Log · KhaiDai Admin",
  description:
    "Read-only audit trail of every sensitive change on KhaiDai: order status transitions, promo code create/delete, user suspension, and more.",
};

/**
 * /admin/audit-log — server route delegating to the client
 * orchestrator.
 */
export default function AdminAuditLogRoute() {
  return <AdminAuditLogPage />;
}
