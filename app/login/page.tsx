import type { Metadata } from "next";
import {
  CustomerAuthFooterLink,
  CustomerAuthLayout,
} from "@/components/auth/CustomerAuthLayout";
import { CustomerLoginForm } from "@/components/auth/CustomerLoginForm";

export const metadata: Metadata = {
  title: "Login · KhaiDai",
  description:
    "Sign in to your KhaiDai account to order from your favourite restaurants.",
};

/**
 * /login — split-screen shell with a dark food-photo hero on the
 * left and the login form on the right.
 */
export default function CustomerLoginPage() {
  return (
    <CustomerAuthLayout
      footerNote={
        <CustomerAuthFooterLink
          prompt="Don&apos;t have an account?"
          cta="Register"
          href="/register"
        />
      }
    >
      <CustomerLoginForm />
    </CustomerAuthLayout>
  );
}