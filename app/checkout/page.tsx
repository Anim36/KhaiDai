import { CheckoutPage } from "@/components/checkout/CheckoutPage";

/**
 * Server entry for the `/checkout` route. The actual UI lives in
 * `<CheckoutPage>` (client component) because it needs the
 * `useSearchParams` and cart-context hooks.
 */
export default function Page() {
  return <CheckoutPage />;
}
