import { LongformPage, type LegalSection } from "./LongformPage";

/**
 * /privacy — placeholder Privacy Policy.
 *
 * Server-rendered. Uses the shared long-form chrome.
 */
const sections: LegalSection[] = [
  {
    heading: "1. What we collect",
    paragraphs: [
      "When you create a KhaiDai account we collect your name, email, phone number, and delivery address. When you place an order we also collect order details, payment information, and any messages you send to the rider or restaurant.",
      "We also collect basic device and usage information — app version, device type, and which screens you visit — so we can fix bugs and improve the experience.",
    ],
  },
  {
    heading: "2. Why we use it",
    paragraphs: [
      "We use your information to deliver your food, to process payments, to send you order updates, and to keep the Platform safe for everyone.",
      "We never sell your personal data. We only share what is needed for an order to be delivered — your name, address, and phone number are visible to the restaurant preparing the order and the rider delivering it.",
    ],
  },
  {
    heading: "3. Payments",
    paragraphs: [
      "All card and mobile-wallet payments are processed by PCI-DSS compliant third-party payment processors. We do not store full card numbers, CVVs, or PINs on our servers.",
      "For cash on delivery, no payment information is required at the time of order — the rider collects payment from you on arrival.",
    ],
  },
  {
    heading: "4. Cookies & analytics",
    paragraphs: [
      "We use first-party cookies to keep you signed in and a small set of analytics events to understand how the Platform is used. You can disable non-essential cookies from your browser or device settings without losing access to core features.",
    ],
  },
  {
    heading: "5. Your rights",
    paragraphs: [
      "You can request a copy of the personal data we hold about you, ask us to correct it, or ask us to delete your account at any time. Email info.khaidai@gmail.com and we will respond within 7 working days.",
      "If you have an unresolved concern, you have the right to lodge a complaint with your local data-protection authority.",
    ],
  },
  {
    heading: "6. Children",
    paragraphs: [
      "KhaiDai is intended for users aged 13 and above. We do not knowingly collect information from children under 13. If we learn that we have, we will delete the data and close the account.",
    ],
  },
  {
    heading: "7. Contact us",
    paragraphs: [
      "Questions about this policy? Email info.khaidai@gmail.com or visit our Contact page.",
    ],
  },
];

export function PrivacyPage() {
  return (
    <LongformPage
      pill="Privacy Policy"
      title="How KhaiDai handles your data"
      intro="We collect the minimum data we need to deliver your orders, and we never sell your personal information. This page explains exactly what we collect, why, and what you can do with it."
      lastUpdated="October 2026"
      sections={sections}
    />
  );
}
