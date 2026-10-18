/**
 * Mock data for the rider help page.
 *
 *   • `faqItems` — 6 common rider questions + answers. Order is
 *     "most-asked-first" so the FAQ reads naturally without any
 *     search/sort UX.
 *
 *   • `supportContacts` — phone + email + live-chat CTA so the
 *     "Contact support" card has something to render. The chat
 *     CTA is intentionally a no-op (placeholder).
 *
 *   • `validateReport(values)` — pure validator for the
 *     "Report an Issue" form. The form itself owns the state
 *     machine but delegates the rules here so future server-side
 *     submission can reuse the same checks.
 */

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const faqItems: FaqItem[] = [
  {
    id: "faq-1",
    question: "How do I get paid?",
    answer:
      "Your earnings are added to your in-app wallet after each completed delivery. Cash out any time to your registered bKash / Nagad / bank account — transfers arrive within 2 hours during business hours, or by the next morning outside business hours.",
  },
  {
    id: "faq-2",
    question: "What if the customer isn't available at the drop-off?",
    answer:
      "Wait at the location for 5 minutes, then try calling the customer. If you still can't reach them, mark the order as 'Customer not reachable' from the trip screen and return the order to the restaurant — your full base fare is still credited.",
  },
  {
    id: "faq-3",
    question: "Can I cancel an accepted trip?",
    answer:
      "You can decline a request before pickup without penalty. After pickup, contact rider support immediately — repeated cancellations after pickup affect your acceptance rate and may trigger a temporary review.",
  },
  {
    id: "faq-4",
    question: "How are incentive bonuses calculated?",
    answer:
      "Peak-hour incentives (10× — 12× weekday and 6 PM — 9 PM weekends) and distance bonuses are added on top of your base fare. The 'Today's Summary' card shows how much you've earned in incentives today.",
  },
  {
    id: "faq-5",
    question: "What documents do I need to ride?",
    answer:
      "A valid driving license (bike / car) or NID for bicycle riders, plus a vehicle registration card. Keep the originals accessible — KhaiDai may request verification photos before your weekly payout is released.",
  },
  {
    id: "faq-6",
    question: "How do I update my vehicle or payout details?",
    answer:
      "Open Settings → Vehicle & Payout. Changes to your payout method take effect for the next withdrawal. Vehicle changes require re-uploading your registration card and may trigger a short verification window.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Support contacts                                                          */
/* -------------------------------------------------------------------------- */

export type SupportContact = {
  id: string;
  label: string;
  value: string;
  href: string;
  description: string;
};

export const supportContacts: SupportContact[] = [
  {
    id: "sup-phone",
    label: "Rider Hotline",
    value: "+880 1700-000142",
    href: "tel:+8801700000142",
    description: "24/7 — fastest way to reach a human during a trip.",
  },
  {
    id: "sup-email",
    label: "Email Support",
    value: "riders@khaidai.bd",
    href: "mailto:riders@khaidai.bd",
    description: "Replies within 4 hours during business hours, 12 hours overnight.",
  },
  {
    id: "sup-chat",
    label: "Live Chat",
    value: "Open chat window",
    href: "#",
    description: "Chat with the rider ops team — placeholder for the in-app chat.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Report-an-issue validation                                                */
/* -------------------------------------------------------------------------- */

export type ReportIssueErrors = {
  subject?: string;
  description?: string;
};

export function validateReportIssue(values: {
  subject: string;
  description: string;
}): ReportIssueErrors {
  const errors: ReportIssueErrors = {};
  const subject = values.subject.trim();
  const description = values.description.trim();

  if (!subject) errors.subject = "Please add a short subject line.";
  else if (subject.length < 4)
    errors.subject = "Subject should be at least 4 characters.";
  else if (subject.length > 80)
    errors.subject = "Subject should be 80 characters or fewer.";

  if (!description) errors.description = "Please describe what happened.";
  else if (description.length < 20)
    errors.description = "Add a bit more detail — at least 20 characters.";

  return errors;
}
