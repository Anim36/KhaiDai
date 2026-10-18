import type { Metadata } from "next";
import { OffersPage } from "@/components/offers/OffersPage";

export const metadata: Metadata = {
  title: "Offers & Promos · KhaiDai",
  description:
    "Browse KhaiDai's active discount codes and free-delivery promos. Save on every order.",
};

/**
 * /offers — server route delegating to the client orchestrator.
 */
export default function OffersRoute() {
  return <OffersPage />;
}
