// Mock FAQ + contact info for the customer /help page.

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const faqItems: FaqItem[] = [
  {
    id: "faq-1",
    question: "How do I place an order on KhaiDai?",
    answer:
      "Open the KhaiDai app or website, browse restaurants or trending dishes, add items to your cart, then confirm with your delivery address and payment method. You'll get a live order status from 'Confirmed' to 'On the way'.",
  },
  {
    id: "faq-2",
    question: "What payment methods do you accept?",
    answer:
      "We accept cash on delivery, bKash, Nagad, Rocket, and major credit/debit cards. Available payment options depend on the restaurant — most support at least two.",
  },
  {
    id: "faq-3",
    question: "How can I track my delivery?",
    answer:
      "Once the rider picks up your order you'll see live tracking on the order screen, including the rider's name, vehicle, and a real-time map. SMS push notifications are sent for each status change.",
  },
  {
    id: "faq-4",
    question: "Can I cancel or modify my order after placing it?",
    answer:
      "You can cancel for free within 60 seconds of placing the order, before the restaurant starts preparing it. After that, please contact support — we'll do our best to help, depending on the kitchen's progress.",
  },
  {
    id: "faq-5",
    question: "What if my order arrives late or is missing items?",
    answer:
      "Use the 'Help' button on the order screen within 24 hours of delivery and select the issue. Refunds or credits are typically processed within 1–3 business days once verified.",
  },
  {
    id: "faq-6",
    question: "How do promo codes work?",
    answer:
      "Paste your active promo code (e.g. BIRYANI20) into the 'Promo' field at checkout. Discounts apply to eligible items only and may have a minimum order value. Codes are case-insensitive.",
  },
  {
    id: "faq-7",
    question: "How do I become a rider or restaurant partner?",
    answer:
      "Visit the 'Work with us' section in the footer to apply as a rider or as a restaurant partner. Both flows take about 5–10 minutes and you can complete verification entirely online.",
  },
  {
    id: "faq-8",
    question: "Is my data safe with KhaiDai?",
    answer:
      "Yes. We never sell your personal data. All payments are processed through PCI-DSS compliant gateways, and we encrypt sensitive information in transit and at rest. See our Privacy Policy for full details.",
  },
];

export const helpContacts = [
  {
    id: "sup-phone",
    label: "Phone",
    value: "+880 1753-226124",
    href: "tel:+8801753226124",
  },
  {
    id: "sup-email",
    label: "Email",
    value: "info.khaidai@gmail.com",
    href: "mailto:info.khaidai@gmail.com",
  },
  {
    id: "sup-hours",
    label: "Hours",
    value: "Every day, 8:00 AM – 11:00 PM",
    href: "#",
  },
];
