/**
 * ধাপ ৩ — which orders are allowed into the operational queues?
 *
 * A gateway order exists in two shapes:
 *
 *   • Cash on Delivery — created at /api/orders, immediately real.
 *     There is no gateway round-trip, so `paymentGatewayStatus`
 *     stays `NOT_INITIATED` forever and must NOT be read as
 *     "unpaid".
 *   • bKash / Nagad / Rocket / Card — created at /api/orders but
 *     the money is only captured after the customer comes back
 *     through the SSLCommerz callback. Until then the row is a
 *     ghost: if a customer abandons the gateway page, or the
 *     browser dies before the redirect, the order would sit in
 *     the kitchen queue forever and a rider would deliver food
 *     nobody paid for.
 *
 * So the single rule, used by every Partner / Rider list query:
 * a non-COD order is only visible once `paymentGatewayStatus`
 * has reached a settled state. `PAID` is the only settled state
 * worth dispatching — `FAILED` and `CANCELLED` are terminal
 * negatives.
 *
 * Expressing it as a single exported object (instead of the
 * boolean `COD || PAID`) keeps the intent obvious at every call
 * site and makes it greppable.
 */

export const SETTLED_PAYMENT_FILTER = {
  OR: [
    // Cash on Delivery is settled the moment the order is created.
    { paymentMethod: "CASH" as const },
    // Everything else must have a confirmed gateway payment.
    { paymentGatewayStatus: "PAID" as const },
  ],
};
