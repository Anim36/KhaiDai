import { OrderTrackingPage } from "@/components/orders/OrderTrackingPage";

type RouteParams = { params: { id: string } };

/**
 * Server entry for `/orders/[id]/track`.
 *
 * The dynamic `id` is forwarded into the (client) `OrderTrackingPage`
 * component, which derives a deterministic tracking view from it via
 * `getOrderTracking`. We intentionally do NOT call `notFound()` on
 * unknown ids — the tracking screen is meant to work for *any* id the
 * user pastes into the URL.
 */
export default function Page({ params }: RouteParams) {
  return <OrderTrackingPage id={params.id} />;
}
