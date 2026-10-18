import type { Metadata } from "next";
import { AdminProfileRequestsPage } from "@/components/admin/dashboard/AdminProfileRequestsPage";

export const metadata: Metadata = {
  title: "Profile Requests · KhaiDai Admin",
  description:
    "Review rider requests to update locked profile or vehicle details.",
};

/**
 * /admin/profile-requests — server route that delegates to the
 * client orchestrator. The orchestrator owns the status filter
 * + the Approve / Reject flow.
 */
export default function AdminProfileRequestsRoute() {
  return <AdminProfileRequestsPage />;
}