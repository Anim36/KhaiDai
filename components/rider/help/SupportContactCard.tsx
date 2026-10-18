"use client";

import {
  ChatIcon,
  HelpIcon,
  MailIcon,
  PhoneIcon,
} from "@/components/icons";
import type { SupportContact } from "@/data/rider-help";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Contact card                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Contact-support card. Renders three rows (phone / email / live
 * chat) with matching icons + a real `tel:` / `mailto:` anchor
 * for the first two. Live chat is a placeholder button (no
 * real handler) so the demo flow stays believable without a
 * backend.
 */
export function SupportContactCard({
  contacts,
}: {
  contacts: SupportContact[];
}) {
  const t = useT();
  return (
    <section
      aria-label={t("rider.help.contactAria")}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.help.contactTitle")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("rider.help.contactSubtitle")}
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {contacts.map((c) => (
          <ContactRow key={c.id} contact={c} />
        ))}
      </ul>
    </section>
  );
}

function ContactRow({ contact }: { contact: SupportContact }) {
  const t = useT();
  const icon =
    contact.id === "sup-phone" ? (
      <PhoneIcon size={18} />
    ) : contact.id === "sup-email" ? (
      <MailIcon size={18} />
    ) : contact.id === "sup-chat" ? (
      <ChatIcon size={18} />
    ) : (
      <HelpIcon size={18} />
    );

  const isChat = contact.id === "sup-chat";

  // Live chat is a placeholder — clicking it alerts instead of
  // opening a real chat window so the demo flow stays believable.
  const handleClick = (e: React.MouseEvent) => {
    if (isChat && typeof window !== "undefined") {
      e.preventDefault();
      window.alert(t("rider.help.contactChatSoonAlert"));
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff5f3] text-brand"
          aria-hidden
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {contact.id === "sup-phone"
              ? t("rider.help.contactPhone")
              : contact.id === "sup-email"
                ? t("rider.help.contactEmail")
                : contact.id === "sup-chat"
                  ? t("rider.help.contactChat")
                  : contact.label}
          </span>
          <span className="text-[14px] font-semibold text-ink truncate">
            {contact.value}
          </span>
          <span className="text-[12px] text-ink-muted truncate">
            {contact.id === "sup-phone"
              ? t("rider.help.contactPhoneDesc")
              : contact.id === "sup-email"
                ? t("rider.help.contactEmailDesc")
                : contact.id === "sup-chat"
                  ? t("rider.help.contactChatDesc")
                  : contact.description}
          </span>
        </div>
      </div>
      <a
        href={contact.href}
        onClick={handleClick}
        data-contact={contact.id}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-white px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-line/40 border border-line"
      >
        {isChat
          ? t("rider.help.contactOpenChat")
          : contact.id === "sup-phone"
            ? t("rider.help.contactCall")
            : t("rider.help.contactEmail_")}
      </a>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Report an issue form                                                      */
/* -------------------------------------------------------------------------- */

import { useState } from "react";
import {
  SettingsSubmitButton,
  SettingsTextarea,
  SettingsTextField,
} from "@/components/partner/dashboard/SettingsForm";
import { validateReportIssue, type ReportIssueErrors } from "@/data/rider-help";
import { CheckIcon } from "@/components/icons";

/**
 * "Report an Issue" form — subject + description. Uses the
 * shared SettingsForm primitives from the partner side
 * (SettingsTextField / SettingsTextarea / SettingsSubmitButton)
 * so all settings-style forms across the app share the same
 * visual language.
 *
 * Submit is intentionally mock-only — no backend exists for this
 * milestone, so the form flips a "submitted" pill and clears the
 * fields after a short delay.
 */
export function ReportIssueForm() {
  const t = useT();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<ReportIssueErrors>({});
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "submitted"
  >("idle");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitState === "submitting") return;
    const values = { subject, description };
    const next = validateReportIssue(values);
    // Override the English-only validator with localized copies so
    // the report form behaves the same as the login + register
    // forms (English in the data layer, localized at render time).
    const localized: ReportIssueErrors = {};
    if (next.subject) {
      const trimmed = subject.trim();
      if (trimmed.length === 0)
        localized.subject = t("rider.help.reportErrors.subjectRequired");
      else if (trimmed.length < 4)
        localized.subject = t("rider.help.reportErrors.subjectShort");
      else localized.subject = t("rider.help.reportErrors.subjectLong");
    }
    if (next.description) {
      if (description.trim().length === 0)
        localized.description = t("rider.help.reportErrors.descriptionRequired");
      else
        localized.description = t("rider.help.reportErrors.descriptionShort");
    }
    setErrors(localized);
    if (Object.keys(localized).length > 0) return;

    setSubmitState("submitting");
    window.setTimeout(() => {
      setSubmitState("submitted");
      setSubject("");
      setDescription("");
      // Reset the success pill after a short window so the rider
      // can see the form is ready for the next report.
      window.setTimeout(() => setSubmitState("idle"), 2500);
    }, 600);
  };

  return (
    <section
      aria-label={t("rider.help.reportAria")}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.help.reportTitle")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("rider.help.reportSubtitle")}
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <SettingsTextField
          name="subject"
          label={t("rider.help.reportSubjectLabel")}
          placeholder={t("rider.help.reportSubjectPlaceholder")}
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            if (errors.subject) setErrors({ ...errors, subject: undefined });
          }}
          error={errors.subject}
          maxLength={80}
        />
        <SettingsTextarea
          name="description"
          label={t("rider.help.reportDescriptionLabel")}
          placeholder={t("rider.help.reportDescriptionPlaceholder")}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (errors.description)
              setErrors({ ...errors, description: undefined });
          }}
          error={errors.description}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          {submitState === "submitted" ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#dcfce7] px-3 py-1.5 text-[12px] font-semibold text-[#16a34a]">
              <CheckIcon size={14} />
              {t("rider.help.reportSubmitted")}
            </span>
          ) : null}
          <SettingsSubmitButton pending={submitState === "submitting"}>
            {t("rider.help.reportSubmit")}
          </SettingsSubmitButton>
        </div>
      </form>
    </section>
  );
}
