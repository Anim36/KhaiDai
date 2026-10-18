import type { Metadata } from "next";
import { AdminUsersPage } from "@/components/admin/dashboard/AdminUsersPage";

export const metadata: Metadata = {
  title: "Users · KhaiDai Admin",
  description:
    "Manage platform users on KhaiDai: filter by role, search by name or email, view profile, and suspend or reinstate accounts.",
};

/**
 * /admin/users — server route delegating to the client orchestrator.
 */
export default function AdminUsersRoute() {
  return <AdminUsersPage />;
}
