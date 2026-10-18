import type { Metadata } from "next";
import { AdminOrdersPage } from "@/components/admin/dashboard/AdminOrdersPage";

export const metadata: Metadata = {
  title: "Orders · KhaiDai Admin",
  description:
    "Platform-wide order list for KhaiDai: filter by status and date range, inspect full order detail (items, customer, restaurant, rider).",
};

/**
 * /admin/orders — server route delegating to the client orchestrator.
 */
export default function AdminOrdersRoute() {
  return <AdminOrdersPage />;
}
