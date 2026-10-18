import type { Metadata } from "next";
import { AdminRidersPage } from "@/components/admin/dashboard/AdminRidersPage";

export const metadata: Metadata = {
  title: "Riders · Admin · KhaiDai",
  description:
    "Per-rider overview: online status, last seen, today's hours, lifetime earnings. Click through for 30-day hours, recent deliveries, zone map and admin zone edit.",
};

/**
 * /admin/riders — server route delegating to the client
 * orchestrator.
 */
export default function AdminRidersRoute() {
  return <AdminRidersPage />;
}
