import { LongformPage, type LegalSection } from "./LongformPage";

/**
 * /terms — placeholder Terms of Service.
 *
 * Server-rendered. Uses the shared long-form chrome so the page
 * reads as part of the customer app.
 */
const sections: LegalSection[] = [
  {
    heading: "1. Acceptance of Terms",
    paragraphs: [
      "By accessing or using KhaiDai (the \"Platform\"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Platform.",
      "We may update these Terms from time to time. Continued use after a change means you accept the updated Terms.",
    ],
  },
  {
    heading: "2. Your Account",
    paragraphs: [
      "To place orders, track deliveries, or contact support, you must create a KhaiDai account with accurate, current, and complete information.",
      "You are responsible for keeping your password secure and for any activity that happens under your account. Please notify us immediately if you suspect unauthorised access.",
    ],
  },
  {
    heading: "3. Orders, Pricing & Payment",
    paragraphs: [
      "Prices on the Platform are set by partner restaurants and may change without notice. The final price shown at checkout — including delivery fees, taxes, and discounts — is the amount you will be charged.",
      "We accept the payment methods listed on the Help page. Cash on Delivery is available at most restaurants; where it is not, the option will be hidden at checkout.",
    ],
  },
  {
    heading: "4. Cancellations & Refunds",
    paragraphs: [
      "You may cancel an order for free within 60 seconds of placing it, or until the restaurant starts preparing it — whichever comes first. After that, please contact support and we will try to help.",
      "Refunds for late, missing, or incorrect orders are typically processed within 1–3 business days after verification.",
    ],
  },
  {
    heading: "5. Restaurant & Rider Partners",
    paragraphs: [
      "Restaurants and riders operate as independent partners. KhaiDai provides the Platform but is not the employer of any rider or the operator of any restaurant.",
      "Our Trust & Safety team may suspend or remove any partner that fails to meet our standards of hygiene, accuracy, or professional conduct.",
    ],
  },
  {
    heading: "6. Limitation of Liability",
    paragraphs: [
      "To the maximum extent permitted by law, KhaiDai is not liable for indirect, incidental, or consequential damages arising from your use of the Platform.",
      "Our total liability for any claim related to the Platform will not exceed the delivery fees you paid for the relevant order.",
    ],
  },
  {
    heading: "7. Contact",
    paragraphs: [
      "Questions about these Terms? Email us at info.khaidai@gmail.com or visit our Contact page.",
    ],
  },
];

export function TermsPage() {
  return (
    <LongformPage
      pill="Terms of Service"
      title="Terms & Conditions"
      intro="These Terms govern your use of KhaiDai — the customer website, mobile apps, and any related services. Please read them carefully before placing an order."
      lastUpdated="October 2026"
      sections={sections}
    />
  );
}
