import type { Metadata } from "next";
import { RiderDeliveryPage } from "@/components/rider/dashboard/RiderDeliveryPage";

/**
 * /rider/delivery/[id] — server route forwarding the dynamic `id`
 * segment into the client orchestrator which fetches the actual
 * order from the API.
 *
 * We deliberately don't pre-resolve the title from any mock-data
 * helper because the order lookup now lives behind
 * GET /api/orders/[id]. The page still resolves to 200 even when
 * the id is unknown — the orchestrator renders the friendly
 * "Delivery not found" state instead.
 */
export const metadata: Metadata = {
  title: "Delivery · KhaiDai Rider",
  description: "Active delivery on the KhaiDai Rider panel.",
};

export default function RiderDeliveryRoute({
  params,
}: {
  params: { id: string };
}) {
  return <RiderDeliveryPage id={params.id} />;
}
