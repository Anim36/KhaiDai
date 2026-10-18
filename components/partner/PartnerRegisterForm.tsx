"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PartnerField,
  PartnerPasswordField,
  PartnerSelect,
  PartnerSubmitButton,
} from "@/components/partner/PartnerField";
import {
  AddressPicker,
  type AddressPick,
} from "@/components/maps/AddressPicker";
import { UploadCloudIcon } from "@/components/icons";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import { OtpField } from "@/components/auth/OtpField";
import { useT } from "@/lib/i18n/LocaleProvider";
import {
  assertNonImageUnderCap,
  prepareImageForUpload,
} from "@/lib/clientImage";

/**
 * /partner/register form body — drives the three-step pill switcher
 * ("Business Details" / "Upload Documents" / "Verify Email").
 *
 * কাজ ১ — All form data lives in component state across steps so the
 * final submit (which fires once at the end of step 3) carries the
 * full payload to the server. The earlier design read fields from the
 * DOM via FormData; combined with conditional rendering of steps that
 * approach silently dropped every field that wasn't currently in the
 * DOM — which is exactly the bug the user reported.
 */
type Step = "details" | "documents" | "verify";

type PartnerFormState = {
  name: string;
  owner: string;
  email: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  cuisine: string;
  password: string;
  tradeLicense: DocFile | null;
  ownerNid: DocFile | null;
};

type DocFile = {
  name: string;
  size: number;
  mime: string;
  dataUrl: string;
};

export function PartnerRegisterForm({
  activeStep,
  onStepChange,
}: {
  activeStep: Step;
  onStepChange: (step: Step) => void;
}) {
  const [state, setState] = useState<PartnerFormState>({
    name: "",
    owner: "",
    email: "",
    phone: "",
    address: "",
    latitude: null,
    longitude: null,
    cuisine: "",
    password: "",
    tradeLicense: null,
    ownerNid: null,
  });
  const [otp, setOtp] = useState("");

  const setField = <K extends keyof PartnerFormState>(
    key: K,
    value: PartnerFormState[K],
  ) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  switch (activeStep) {
    case "details":
      return (
        <BusinessDetailsStep
          state={state}
          setField={setField}
          onContinue={() => onStepChange("documents")}
        />
      );
    case "documents":
      return (
        <DocumentsStep
          state={state}
          setField={setField}
          onBack={() => onStepChange("details")}
          onContinue={() => onStepChange("verify")}
        />
      );
    case "verify":
      return (
        <VerifyStep
          state={state}
          otp={otp}
          setOtp={setOtp}
          onBack={() => onStepChange("documents")}
        />
      );
  }
}

/* -------------------------------------------------------------------------- */
/*  Step 1 — Business Details                                                 */
/* -------------------------------------------------------------------------- */

function BusinessDetailsStep({
  state,
  setField,
  onContinue,
}: {
  state: PartnerFormState;
  setField: <K extends keyof PartnerFormState>(
    key: K,
    value: PartnerFormState[K],
  ) => void;
  onContinue: () => void;
}) {
  const t = useT();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndContinue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!state.name.trim()) next.name = t("partner.register.errors.restaurantNameRequired");
    if (!state.owner.trim()) next.owner = t("partner.register.errors.nameRequired");
    if (!state.email.trim()) next.email = t("partner.register.errors.emailRequired");
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.email))
      next.email = t("partner.register.errors.emailInvalid");
    if (!state.phone.trim()) next.phone = t("partner.register.errors.phoneRequired");
    if (state.latitude === null || state.longitude === null)
      next.address = t("partner.register.errors.addressRequired");
    else if (!state.address.trim())
      next.address = t("partner.register.errors.addressRequired");
    if (!state.cuisine) next.cuisine = t("partner.register.errors.cuisineRequired");
    if (!state.password) next.password = t("partner.register.errors.passwordTooShort");
    else if (state.password.length < 8)
      next.password = t("partner.register.errors.passwordTooShort");
    setErrors(next);
    if (Object.keys(next).length === 0) onContinue();
  };

  return (
    <form onSubmit={validateAndContinue} noValidate className="flex flex-col gap-5">
      <PartnerField
        name="name"
        label={t("partner.register.fields.restaurantName")}
        placeholder={t("partner.register.fields.restaurantNamePlaceholder")}
        value={state.name}
        onChange={(e) => setField("name", e.target.value)}
        error={errors.name}
      />
      <PartnerField
        name="owner"
        label={t("partner.register.fields.fullName")}
        placeholder={t("partner.register.fields.namePlaceholder")}
        value={state.owner}
        onChange={(e) => setField("owner", e.target.value)}
        error={errors.owner}
      />
      <PartnerField
        name="email"
        label={t("partner.register.fields.email")}
        type="email"
        placeholder={t("partner.register.fields.emailPlaceholder")}
        value={state.email}
        onChange={(e) => setField("email", e.target.value)}
        error={errors.email}
      />
      <PartnerField
        name="phone"
        label={t("partner.register.fields.phone")}
        type="tel"
        placeholder={t("partner.register.fields.phonePlaceholder")}
        value={state.phone}
        onChange={(e) => setField("phone", e.target.value)}
        error={errors.phone}
      />
      <AddressPicker
        title={t("partner.register.fields.address")}
        description={t("partner.register.fields.addressPlaceholder")}
        value={
          state.latitude !== null && state.longitude !== null
            ? {
                lat: state.latitude,
                lng: state.longitude,
                address: state.address,
              }
            : null
        }
        onChange={(p: AddressPick | null) => {
          if (p) {
            setField("address", p.address);
            setField("latitude", p.lat);
            setField("longitude", p.lng);
          } else {
            setField("address", "");
            setField("latitude", null);
            setField("longitude", null);
          }
          if (errors.address) setErrors((e) => ({ ...e, address: "" }));
        }}
        requireForSubmit={true}
        error={errors.address}
      />
      <PartnerSelect
        name="cuisine"
        label={t("partner.register.fields.cuisine")}
        placeholder={t("partner.register.fields.cuisinePlaceholder")}
        options={[
          { value: "bangladeshi", label: "Bangladeshi" },
          { value: "indian", label: "Indian" },
          { value: "chinese", label: t("home.categoriesItems.chinese") },
          { value: "burgers", label: t("home.categoriesItems.burgers") },
          { value: "desserts", label: t("home.categoriesItems.sweets") },
          { value: "healthy", label: t("home.categoriesItems.healthy") },
          { value: "other", label: "Other" },
        ]}
        value={state.cuisine}
        onChange={(e) => setField("cuisine", e.target.value)}
        error={errors.cuisine}
      />
      <PartnerPasswordField
        name="password"
        label={t("partner.register.fields.password")}
        placeholder={t("partner.register.fields.passwordHint")}
        value={state.password}
        onChange={(e) => setField("password", e.target.value)}
        error={errors.password}
      />
      <PartnerSubmitButton pending={false}>
        {t("partner.register.buttons.continue")}
      </PartnerSubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 — Upload Documents                                                 */
/* -------------------------------------------------------------------------- */

function DocumentsStep({
  state,
  setField,
  onBack,
  onContinue,
}: {
  state: PartnerFormState;
  setField: <K extends keyof PartnerFormState>(
    key: K,
    value: PartnerFormState[K],
  ) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndContinue = () => {
    const next: Record<string, string> = {};
    if (!state.tradeLicense)
      next.tradeLicense = t("partner.register.errors.tradeLicenceRequired");
    if (!state.ownerNid) next.ownerNid = t("partner.register.errors.nidRequired");
    setErrors(next);
    if (Object.keys(next).length === 0) onContinue();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        validateAndContinue();
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      <DocumentDropzone
        label={t("partner.register.fields.tradeLicence")}
        help={t("partner.register.fields.tradeLicenceHelp")}
        file={state.tradeLicense}
        onChange={(f) => setField("tradeLicense", f)}
        error={errors.tradeLicense}
      />
      <DocumentDropzone
        label={`${t("partner.register.fields.nidFront")} & ${t("partner.register.fields.nidBack")}`}
        help={t("partner.register.fields.nidFrontHelp")}
        file={state.ownerNid}
        onChange={(f) => setField("ownerNid", f)}
        error={errors.ownerNid}
      />
      <div className="flex flex-col gap-3">
        <PartnerSubmitButton pending={false}>
          {t("partner.register.buttons.continue")}
        </PartnerSubmitButton>
        <button
          type="button"
          onClick={onBack}
          className="h-10 w-full rounded-xl text-[14px] font-semibold text-ink-muted hover:text-ink"
        >
          ← {t("partner.common.back")}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 — Verify Email + Final Submit                                      */
/* -------------------------------------------------------------------------- */

function VerifyStep({
  state,
  otp,
  setOtp,
  onBack,
}: {
  state: PartnerFormState;
  otp: string;
  setOtp: (next: string) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const { register } = useAuth();
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | undefined>(undefined);
  const [apiError, setApiError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    if (!otp || otp.length !== 6) {
      setOtpError(t("partner.register.errors.otpRequired"));
      return;
    }
    setOtpError(undefined);
    setApiError(null);
    setSubmitting(true);
    try {
      const documents: Array<{
        documentType: "TRADE_LICENSE" | "OWNER_NID";
        fileName: string;
        fileUrl: string;
        mime: string;
        size: number;
      }> = [];
      if (state.tradeLicense) {
        documents.push({
          documentType: "TRADE_LICENSE",
          fileName: state.tradeLicense.name,
          fileUrl: state.tradeLicense.dataUrl,
          mime: state.tradeLicense.mime,
          size: state.tradeLicense.size,
        });
      }
      if (state.ownerNid) {
        documents.push({
          documentType: "OWNER_NID",
          fileName: state.ownerNid.name,
          fileUrl: state.ownerNid.dataUrl,
          mime: state.ownerNid.mime,
          size: state.ownerNid.size,
        });
      }

      await register({
        name: state.owner,
        email: state.email,
        password: state.password,
        phone: state.phone,
        role: "PARTNER",
        otp,
        restaurant: {
          name: state.name,
          address: state.address,
          cuisine: state.cuisine,
          ...(state.latitude !== null && state.longitude !== null
            ? { latitude: state.latitude, longitude: state.longitude }
            : {}),
        },
        documents,
      });
      router.push("/partner/dashboard");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof AuthApiError) {
        const msg = err.message.toLowerCase();
        if (msg.includes("code")) {
          setOtpError(err.message);
        } else {
          setApiError(err.message);
        }
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError(t("partner.register.errors.generic"));
      }
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("register.verifyEmail")}
        </span>
        <p className="text-[13px] font-normal leading-snug text-ink-muted">
          {t("partner.register.step5Subtitle").replace("{email}", state.email || "your email")}
        </p>
      </div>

      {apiError ? (
        <div
          role="alert"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand"
        >
          {apiError}
        </div>
      ) : null}

      <OtpField
        email={state.email}
        value={otp}
        onChange={setOtp}
        error={otpError}
      />

      <PartnerSubmitButton pending={submitting}>
        {t("partner.register.buttons.verify")}
      </PartnerSubmitButton>
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="h-10 w-full rounded-xl text-[14px] font-semibold text-ink-muted hover:text-ink disabled:opacity-60"
      >
        ← {t("partner.common.back")}
      </button>
    </form>
  );
}

function DocumentDropzone({
  label,
  help,
  file,
  onChange,
  error,
}: {
  label: string;
  help?: string;
  file: DocFile | null;
  onChange: (file: DocFile | null) => void;
  error?: string;
}) {
  const t = useT();
  return (
    <div className="flex w-full flex-col gap-2">
      <label className="text-[14px] font-semibold text-ink leading-none">
        {label}
      </label>
      <label
        className={
          "flex h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-surface px-4 text-center transition-colors " +
          (error
            ? "border-rose-500 bg-rose-50"
            : file
              ? "border-brand bg-brand/5"
              : "border-line hover:border-brand")
        }
      >
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) {
              onChange(null);
              return;
            }
            try {
              // Image → compress on the client so the data URL
              // stays inside Vercel's 4.5 MB body cap. PDF →
              // enforce a 3 MB raw cap (the JSON envelope adds
              // ~30% for base64).
              const dataUrl = f.type.startsWith("image/")
                ? await prepareImageForUpload(f)
                : await new Promise<string>((resolve, reject) => {
                    assertNonImageUnderCap(f);
                    const reader = new FileReader();
                    reader.onload = () => {
                      const r = reader.result;
                      if (typeof r === "string") resolve(r);
                      else reject(new Error("FileReader returned a non-string"));
                    };
                    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
                    reader.readAsDataURL(f);
                  });
              onChange({
                name: f.name,
                size: f.size,
                mime: f.type || "application/octet-stream",
                dataUrl,
              });
            } catch (err) {
              window.alert(
                err instanceof Error
                  ? err.message
                  : "Could not read the file. Please try another file.",
              );
              onChange(null);
            }
          }}
        />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand">
          <UploadCloudIcon size={18} />
        </span>
        {file ? (
          <span className="text-[13px] font-semibold text-ink">
            {file.name}
          </span>
        ) : (
          <>
            <span className="text-[13px] font-semibold text-ink">
              {t("partner.register.uploads.clickToUpload")}
            </span>
            <span className="text-[12px] font-normal text-ink-muted">
              {help ?? t("partner.register.uploads.wrongType")}
            </span>
          </>
        )}
      </label>
      {error ? (
        <span className="text-[12px] font-normal text-rose-500">
          {error}
        </span>
      ) : null}
    </div>
  );
}