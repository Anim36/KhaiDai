import { CustomerProfilePage } from "@/components/profile/CustomerProfilePage";

/**
 * Server entry for `/profile`. The actual UI lives in
 * `<CustomerProfilePage />` (a client component) because tab switching
 * needs React state. This file mirrors the pattern used by every other
 * route in the app (`/`, `/checkout`, `/orders/[id]/track`,
 * `/restaurants/[id]`).
 */
export default function Page() {
  return <CustomerProfilePage />;
}
