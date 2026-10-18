import type { Metadata } from "next";
import {
  RiderAuthLayout,
  RiderFooterLink,
} from "@/components/rider/RiderAuthLayout";
import { RiderLoginForm } from "@/components/rider/RiderLoginForm";

export const metadata: Metadata = {
  title: "Rider Login · KhaiDai",
  description:
    "Sign in to your KhaiDai Rider account to view and accept delivery orders.",
};

/**
 * /rider/login — two-column layout (dark food photo hero left,
 * login form right). Visual chrome follows the Figma `rider-login`
 * frame.
 *
 * Per the spec the page shows no `formHeader` heading — the rider
 * wordmark + "Login" submit button carry the screen identity so
 * the form feels compact.
 */
export default function RiderLoginPage() {
  return (
    <RiderAuthLayout
      footerNote={
        <RiderFooterLink
          prompt="New rider?"
          cta="Register"
          href="/rider/register"
        />
      }
    >
      <RiderLoginForm />
    </RiderAuthLayout>
  );
}
