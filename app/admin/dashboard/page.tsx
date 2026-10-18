import type { Metadata } from "next";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";

export const metadata: Metadata = {
  title: "Admin Dashboard · KhaiDai",
  description:
    "Platform-wide metrics for KhaiDai: user counts, restaurants, orders, revenue, and the last 7 days of order activity.",
};

/**
 * /admin/dashboard — server route that delegates to the client
 * orchestrator. The orchestrator owns the fetch / refresh state
 * machine so the route stays a thin Server Component for SEO +
 * clean metadata.
 */
export default function AdminDashboardRoute() {
  return <AdminDashboardPage />;
}
