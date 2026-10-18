"use client";

import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { RiderPageHeader } from "@/components/rider/dashboard/RiderPageHeader";
import { FaqAccordion } from "@/components/rider/help/FaqAccordion";
import {
  ReportIssueForm,
  SupportContactCard,
} from "@/components/rider/help/SupportContactCard";
import { faqItems, supportContacts } from "@/data/rider-help";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Orchestrator for /rider/help.
 *
 *   â€¢ Two-column shell: 260px sidebar (`activeKey="help"`) +
 *     flex-1 main column.
 *   â€¢ Header â€” same chrome as the other rider pages.
 *   â€¢ Body â€” 3 stacked sections:
 *       1. FAQ accordion (most-asked-first).
 *       2. Contact-support card (phone / email / live chat).
 *       3. Report-an-issue form (subject + description).
 */
export function RiderHelpPage() {
  const t = useT();
  return (
    <RequireAuth role="RIDER">
      <RiderShell activeKey="help">
        <RiderPageHeader
          title={t("rider.help.headerTitle")}
          subtitle={t("rider.help.headerSubtitle")}
        />

        <div className="flex flex-1 flex-col gap-6 p-8">
          <section
            aria-label={t("rider.help.faqAria")}
            className="flex flex-col gap-4"
          >
            <header className="flex flex-col gap-1">
              <h2 className="font-display text-[18px] font-extrabold text-ink">
                {t("rider.help.faqTitle")}
              </h2>
              <p className="text-[12px] text-ink-muted">
                {t("rider.help.faqSubtitle")}
              </p>
            </header>
            <FaqAccordion items={faqItems} />
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SupportContactCard contacts={supportContacts} />
            <ReportIssueForm />
          </div>
        </div>
      </RiderShell>
    </RequireAuth>
    );
}

