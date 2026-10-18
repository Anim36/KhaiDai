import type { Metadata } from "next";
import { AdminRestaurantsPage } from "@/components/admin/dashboard/AdminRestaurantsPage";

export const metadata: Metadata = {
  title: "Restaurants · KhaiDai Admin",
  description:
    "Browse and manage every restaurant on KhaiDai: owner, cuisine, rating, order count, and suspend or reinstate visibility.",
};

/**
 * /admin/restaurants — server route delegating to the client
 * orchestrator.
 */
export default function AdminRestaurantsRoute() {
  return <AdminRestaurantsPage />;
}
