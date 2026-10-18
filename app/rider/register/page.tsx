import type { Metadata } from "next";
import {
  RiderAuthLayout,
  RiderFooterLink,
} from "@/components/rider/RiderAuthLayout";
import { RiderRegisterForm } from "@/components/rider/RiderRegisterForm";

export const metadata: Metadata = {
  title: "Rider Registration · KhaiDai",
  description:
    "Sign up as a KhaiDai Rider and start earning with flexible delivery hours.",
};

/**
 * /rider/register — same two-column shell as the login page, with a
 * fuller heading block and the 7-field RiderRegisterForm.
 */
export default function RiderRegisterPage() {
  return (
    <RiderAuthLayout
      formHeader={{
        title: "Join as a Rider",
        subtitle:
          "Earn on your own schedule — fill in your details below and start accepting deliveries in days.",
      }}
      footerNote={
        <RiderFooterLink
          prompt="Already a rider?"
          cta="Login"
          href="/rider/login"
        />
      }
    >
      <RiderRegisterForm />
    </RiderAuthLayout>
  );
}
