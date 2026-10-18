import type { Metadata } from "next";
import { ContactPage } from "@/components/contact/ContactPage";

export const metadata: Metadata = {
  title: "Contact · KhaiDai",
  description:
    "Get in touch with KhaiDai — phone, email, address, or send us a message through our contact form.",
};

/**
 * /contact — server route delegating to the orchestrator.
 */
export default function ContactRoute() {
  return <ContactPage />;
}
