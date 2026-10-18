import type { Metadata } from "next";
import {
  CustomerAuthFooterLink,
  CustomerAuthLayout,
} from "@/components/auth/CustomerAuthLayout";
import { CustomerRegisterForm } from "@/components/auth/CustomerRegisterForm";

export const metadata: Metadata = {
  title: "Register · KhaiDai",
  description:
    "Create a KhaiDai account to start ordering from hundreds of restaurants.",
};

/**
 * /register — same split-screen shell as /login but with the
 * registration form. Footer link flips to point back at /login.
 *
 * Feat 6 — Referral program. The page is a server component;
 * `?ref=…` is parsed via the route's `searchParams` prop and
 * passed to the client form as the initial value of the
 * "Referral code (optional)" field. The form is editable so
 * the customer can replace the code or clear it entirely
 * before submitting.
 */
export default async function CustomerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawRef = Array.isArray(sp?.ref) ? sp.ref[0] : sp?.ref;
  const initialReferralCode =
    typeof rawRef === "string" && rawRef.trim().length > 0
      ? rawRef.trim().toUpperCase()
      : null;

  return (
    <CustomerAuthLayout
      footerNote={
        <CustomerAuthFooterLink
          prompt="Already have an account?"
          cta="Login"
          href="/login"
        />
      }
    >
      <CustomerRegisterForm initialReferralCode={initialReferralCode} />
    </CustomerAuthLayout>
  );
}