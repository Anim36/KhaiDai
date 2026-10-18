"use client";

import { useState } from "react";
import {
  PartnerAuthLayout,
  PartnerFooterLink,
} from "@/components/partner/PartnerAuthLayout";
import { PartnerRegisterForm } from "@/components/partner/PartnerRegisterForm";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Client-side orchestrator for /partner/register.
 *
 * কাজ ১ — three-step pill switcher. The active step (1/2/3) lives
 * here so it can be shared between the PartnerAuthLayout's pill
 * switcher (visual) and the PartnerRegisterForm's body (which
 * swaps its content based on the same step). Form data lives in
 * PartnerRegisterForm's component state — this orchestrator only
 * owns the step index.
 *
 * Step 3 ("Verify Email") is reached AFTER the user has filled
 * in business details + uploaded documents. The OTP verification
 * happens here; only on success do we POST to /api/auth/register/
 * partner with the FULL payload from steps 1 + 2.
 */
export function PartnerRegisterPageClient() {
  const t = useT();
  const [step, setStep] = useState<"details" | "documents" | "verify">(
    "details",
  );
  return (
    <PartnerAuthLayout
      formHeader={{
        title: t("partner.auth.registerTitle"),
        subtitle: t("partner.auth.registerSubtitle"),
      }}
      tabs={{
        items: [
          { key: "details", label: `1. ${t("partner.auth.tabs.business")}` },
          { key: "documents", label: `2. ${t("partner.auth.tabs.documents")}` },
          { key: "verify", label: `3. ${t("register.verifyEmail")}` },
        ],
        activeKey: step,
        onSelect: (key) =>
          setStep(key as "details" | "documents" | "verify"),
      }}
      footerNote={
        <PartnerFooterLink
          prompt={t("partner.auth.haveAccount")}
          cta={t("partner.auth.login")}
          href="/partner/login"
        />
      }
    >
      <PartnerRegisterForm activeStep={step} onStepChange={setStep} />
    </PartnerAuthLayout>
  );
}