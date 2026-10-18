import type { Metadata } from "next";
import {
  PartnerAuthLayout,
  PartnerFooterLink,
} from "@/components/partner/PartnerAuthLayout";
import { PartnerLoginForm } from "@/components/partner/PartnerLoginForm";

export const metadata: Metadata = {
  title: "Partner Login · KhaiDai",
  description:
    "Sign in to your KhaiDai Partner account to manage your restaurant, menu, and orders.",
};

/**
 * /partner/login — two-column layout with a dark food-photo hero
 * (left) and a minimal email/password form (right). Visual chrome
 * follows the Figma `partner-login` frame.
 */
export default function PartnerLoginPage() {
  return (
    <PartnerAuthLayout
      footerNote={
        <PartnerFooterLink
          prompt="Don&apos;t have an account?"
          cta="Register"
          href="/partner/register"
        />
      }
    >
      <PartnerLoginForm />
    </PartnerAuthLayout>
  );
}
