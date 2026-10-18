import type { Metadata } from "next";
import { MenuManagementPage } from "@/components/partner/dashboard/MenuManagementPage";

export const metadata: Metadata = {
  title: "Menu Management · KhaiDai Partner",
  description:
    "Add, edit, and toggle availability for every dish on your KhaiDai Partner restaurant menu.",
};

/**
 * /partner/menu — server route that delegates to the client
 * orchestrator. The orchestrator owns the items list state + the
 * create/edit modal state machine, so this route stays a thin Server
 * Component for SEO + clean metadata.
 */
export default function PartnerMenuRoute() {
  return <MenuManagementPage />;
}