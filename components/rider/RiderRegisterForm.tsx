"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { AuthApiError, useAuth } from "@/components/auth/AuthProvider";
import { OtpField } from "@/components/auth/OtpField";
import {
  RiderField,
  RiderFileField,
  RiderPasswordField,
  RiderSelect,
} from "@/components/rider/RiderField";
import { validateRegister, type RegisterErrors } from "@/data/rider";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import enMessages from "@/messages/en.json";
import bnMessages from "@/messages/bn.json";

/**
 * /rider/register form body — five-step onboarding flow:
 *
 *   1. Personal details — full name, phone, email, password
 *   2. Vehicle          — type, registration number
 *   3. Documents        — license / NID upload
 *   4. Service zone     — Leaflet map picker
 *   5. Verify email     — Send Code + 6-digit input + final submit
 *
 * All form data lives in component state across steps; the final
 * submit (step 5) carries the full payload plus the verified OTP
 * to /api/auth/register/rider.
 */

const RiderZonePicker = dynamic(
  () =>
    import("@/components/rider/dashboard/RiderZonePicker").then(
      (m) => m.RiderZonePicker,
    ),
  { ssr: false, loading: () => <StepSkeleton /> },
);

function StepSkeleton() {
  return (
    <div className="flex h-[420px] w-full animate-pulse flex-col gap-3 rounded-card border border-line bg-white p-4">
      <div className="h-6 w-1/2 rounded bg-surface" />
      <div className="h-10 w-full rounded bg-surface" />
      <div className="h-[260px] w-full rounded bg-surface" />
    </div>
  );
}

type ZonePick = { lat: number; lng: number; address: string };

type DocFile = {
  name: string;
  size: number;
  mime: string;
  dataUrl: string;
};

type RiderFormState = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  vehicleType: string;
  vehicleReg: string;
  license: DocFile | null;
  zone: ZonePick | null;
};

type Step = 1 | 2 | 3 | 4 | 5;

export function RiderRegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  const [state, setState] = useState<RiderFormState>({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    vehicleType: "",
    vehicleReg: "",
    license: null,
    zone: null,
  });
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const setField = <K extends keyof RiderFormState>(
    key: K,
    value: RiderFormState[K],
  ) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  // Vehicle options resolved through translation so BN gets localised
  // vehicle names without the consumer having to touch the data file.
  // Array values are read directly from the JSON because
  // `TranslationKey` excludes arrays (the typing only models string
  // leaves).
  const vehicleOptions: Array<{ value: string; label: string }> = (() => {
    const dict = locale === "bn" ? bnMessages : enMessages;
    const arr = dict.rider.auth.vehicleTypes;
    if (Array.isArray(arr)) {
      return ["bike", "bicycle", "car"].map((value, idx) => ({
        value,
        label: arr[idx] ?? value,
      }));
    }
    return [
      { value: "bike", label: "Bike" },
      { value: "bicycle", label: "Bicycle" },
      { value: "car", label: "Car" },
    ];
  })();

  const validateCurrentStep = useCallback((): boolean => {
    if (step === 1) {
      const next = validateRegister({
        fullName: state.fullName,
        phone: state.phone,
        email: state.email,
        password: state.password,
        vehicleType: state.vehicleType,
        vehicleReg: state.vehicleReg,
        license: state.license,
      });
      // validateRegister emits English-only messages; remap each
      // surface to a translated copy under rider.auth.errors.* so
      // the register form behaves the same as the login form.
      const stepErrors: RegisterErrors = {
        fullName: next.fullName
          ? state.fullName.trim().length === 0
            ? t("rider.auth.errors.fullNameRequired")
            : t("rider.auth.errors.fullNameShort")
          : undefined,
        phone: next.phone
          ? state.phone.trim().length === 0
            ? t("rider.auth.errors.phoneRequired")
            : t("rider.auth.errors.phoneInvalid")
          : undefined,
        email: next.email
          ? state.email.trim().length === 0
            ? t("rider.auth.errors.emailRequired")
            : t("rider.auth.errors.emailInvalid")
          : undefined,
        password: next.password
          ? state.password.length === 0
            ? t("rider.auth.errors.passwordRequired")
            : t("rider.auth.errors.passwordShort8")
          : undefined,
      };
      setErrors(stepErrors);
      return (
        !stepErrors.fullName &&
        !stepErrors.phone &&
        !stepErrors.email &&
        !stepErrors.password
      );
    }
    if (step === 2) {
      const stepErrors: RegisterErrors = {
        vehicleType: state.vehicleType
          ? undefined
          : t("rider.auth.errors.vehicleTypeRequired"),
        vehicleReg:
          state.vehicleReg.trim().length > 0
            ? undefined
            : t("rider.auth.errors.vehicleRegRequired"),
      };
      setErrors(stepErrors);
      return !stepErrors.vehicleType && !stepErrors.vehicleReg;
    }
    if (step === 3) {
      const stepErrors: RegisterErrors = {
        license: state.license
          ? undefined
          : t("rider.auth.errors.licenseRequiredUpload"),
      };
      setErrors(stepErrors);
      return !stepErrors.license;
    }
    if (step === 4) {
      if (!state.zone) {
        setZoneError(t("rider.auth.errors.zoneRequired"));
        return false;
      }
      setZoneError(null);
      return true;
    }
    if (!otp || otp.length !== 6) {
      setErrors({ otp: t("rider.auth.errors.otpRequired") });
      return false;
    }
    return true;
  }, [step, state, otp, t]);

  const goNext = () => {
    setFormError(null);
    if (step < 5) setStep((s) => (s + 1) as Step);
  };
  const goBack = () => {
    setFormError(null);
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleNext = () => {
    if (validateCurrentStep()) goNext();
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await register({
        name: state.fullName,
        email: state.email,
        password: state.password,
        phone: state.phone,
        role: "RIDER",
        vehicleType: state.vehicleType as "bike" | "bicycle" | "car",
        vehicleRegNumber: state.vehicleReg,
        otp,
        ...(state.license
          ? {
              documents: [
                {
                  documentType: "DRIVING_LICENSE",
                  fileName: state.license.name,
                  fileUrl: state.license.dataUrl,
                  mime: state.license.mime,
                  size: state.license.size,
                },
              ],
            }
          : {}),
        ...(state.zone
          ? {
              zone: {
                lat: state.zone.lat,
                lng: state.zone.lng,
                address: state.zone.address,
                radiusKm: 5,
              },
            }
          : {}),
      });

      try {
        window.localStorage.setItem(
          "khaidai.rider.onboarding",
          JSON.stringify({ licenseName: state.license?.name ?? null }),
        );
      } catch {
        /* private mode etc. — ignore. */
      }
      router.push("/rider/dashboard");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof AuthApiError) {
        const msg = err.message.toLowerCase();
        if (msg.includes("already") || msg.includes("email")) {
          setErrors({ email: err.message });
        } else if (msg.includes("code")) {
          setErrors({ otp: err.message });
        } else if (msg.includes("password")) {
          setErrors({ password: err.message });
        } else if (msg.includes("name")) {
          setErrors({ fullName: err.message });
        } else {
          setFormError(err.message);
        }
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError(t("rider.common.somethingWrong"));
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Stepper step={step} t={t} />

      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand"
        >
          {formError}
        </div>
      ) : null}

      <form
        id="rider-register-form"
        onSubmit={(e) => e.preventDefault()}
        noValidate
        className="flex flex-col gap-5"
      >
        {step === 1 ? (
          <PersonalStep
            state={state}
            setField={setField}
            errors={errors}
            t={t}
          />
        ) : null}
        {step === 2 ? (
          <VehicleStep
            state={state}
            setField={setField}
            errors={errors}
            vehicleOptions={vehicleOptions}
            t={t}
          />
        ) : null}
        {step === 3 ? (
          <DocumentsStep
            state={state}
            setField={setField}
            errors={errors}
            t={t}
          />
        ) : null}
        {step === 4 ? (
          <ZoneStep
            zone={state.zone}
            onSaved={(z) => {
              setField("zone", z);
              setZoneError(null);
            }}
            zoneError={zoneError}
            t={t}
          />
        ) : null}
        {step === 5 ? (
          <VerifyStep
            email={state.email}
            otp={otp}
            setOtp={setOtp}
            errors={errors}
            apiError={formError}
            t={t}
          />
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60"
            >
              {t("rider.auth.register.back")}
            </button>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {t("rider.auth.register.continue")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting
                ? t("rider.auth.register.submitting")
                : t("rider.auth.register.submit")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stepper (visual only — the active key comes from the parent)              */
/* -------------------------------------------------------------------------- */

type TFn = ReturnType<typeof useT>;

function Stepper({ step, t }: { step: Step; t: TFn }) {
  const stepLabels: Array<Step> = [1, 2, 3, 4, 5];
  return (
    <ol className="flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
      {stepLabels.map((n) => {
        const labelKey =
          `rider.auth.register.stepper.${n}` as Parameters<TFn>[0];
        return (
          <li key={n} className="flex items-center gap-2">
            <span
              className={
                "inline-flex h-6 w-6 items-center justify-center rounded-full " +
                (step === n
                  ? "bg-brand text-white"
                  : step > n
                    ? "bg-brand/15 text-brand"
                    : "bg-surface text-ink-muted")
              }
            >
              {n}
            </span>
            <span className={step === n ? "text-ink" : ""}>
              {t(labelKey)}
            </span>
            {n < 5 ? (
              <span aria-hidden="true" className="text-ink-muted">
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 1 — Personal Details                                                  */
/* -------------------------------------------------------------------------- */

function PersonalStep({
  state,
  setField,
  errors,
  t,
}: {
  state: RiderFormState;
  setField: <K extends keyof RiderFormState>(
    key: K,
    value: RiderFormState[K],
  ) => void;
  errors: RegisterErrors;
  t: TFn;
}) {
  return (
    <div className="flex flex-col gap-5">
      <RiderField
        name="fullName"
        label={t("rider.auth.register.step1.fullName")}
        type="text"
        autoComplete="name"
        placeholder={t("rider.auth.register.step1.fullNamePlaceholder")}
        value={state.fullName}
        onChange={(e) => setField("fullName", e.target.value)}
        error={errors.fullName}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <RiderField
          name="phone"
          label={t("rider.auth.register.step1.phone")}
          type="tel"
          autoComplete="tel"
          placeholder={t("rider.auth.register.step1.phonePlaceholder")}
          value={state.phone}
          onChange={(e) => setField("phone", e.target.value)}
          error={errors.phone}
        />
        <RiderField
          name="email"
          label={t("rider.auth.register.step1.email")}
          type="email"
          autoComplete="email"
          placeholder={t("rider.auth.register.step1.emailPlaceholder")}
          value={state.email}
          onChange={(e) => setField("email", e.target.value)}
          error={errors.email}
        />
      </div>
      <RiderPasswordField
        name="password"
        label={t("rider.auth.register.step1.password")}
        autoComplete="new-password"
        placeholder={t("rider.auth.register.step1.passwordPlaceholder")}
        value={state.password}
        onChange={(e) => setField("password", e.target.value)}
        error={errors.password}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 — Vehicle                                                          */
/* -------------------------------------------------------------------------- */

function VehicleStep({
  state,
  setField,
  errors,
  vehicleOptions,
  t,
}: {
  state: RiderFormState;
  setField: <K extends keyof RiderFormState>(
    key: K,
    value: RiderFormState[K],
  ) => void;
  errors: RegisterErrors;
  vehicleOptions: Array<{ value: string; label: string }>;
  t: TFn;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <RiderSelect
          name="vehicleType"
          label={t("rider.auth.register.step2.vehicleType")}
          options={vehicleOptions}
          placeholder={t("rider.auth.register.step2.selectVehicle")}
          value={state.vehicleType}
          onChange={(e) => setField("vehicleType", e.target.value)}
          error={errors.vehicleType}
        />
        <RiderField
          name="vehicleReg"
          label={t("rider.auth.register.step2.vehicleReg")}
          type="text"
          autoComplete="off"
          placeholder={t("rider.auth.register.step2.vehicleRegPlaceholder")}
          value={state.vehicleReg}
          onChange={(e) => setField("vehicleReg", e.target.value)}
          error={errors.vehicleReg}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 — Documents                                                        */
/* -------------------------------------------------------------------------- */

function DocumentsStep({
  state,
  setField,
  errors,
  t,
}: {
  state: RiderFormState;
  setField: <K extends keyof RiderFormState>(
    key: K,
    value: RiderFormState[K],
  ) => void;
  errors: RegisterErrors;
  t: TFn;
}) {
  return (
    <div className="flex flex-col gap-5">
      <RiderFileField
        label={t("rider.auth.register.step3.license")}
        file={state.license}
        onFileChange={(f) => setField("license", f)}
        error={errors.license}
      />
      <p className="text-[12px] font-normal text-ink-muted">
        {t("rider.auth.register.step3.helper")}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 4 — Service Zone                                                     */
/* -------------------------------------------------------------------------- */

function ZoneStep({
  zone,
  onSaved,
  zoneError,
  t,
}: {
  zone: ZonePick | null;
  onSaved: (z: ZonePick) => void;
  zoneError: string | null;
  t: TFn;
}) {
  return (
    <div className="flex flex-col gap-3">
      <RiderZonePicker
        initial={zone ?? undefined}
        title={t("rider.auth.register.step4.title")}
        description={t("rider.auth.register.step4.description")}
        requireForSubmit={false}
        mode="register"
        onSaved={(saved) =>
          onSaved({ lat: saved.lat, lng: saved.lng, address: saved.address })
        }
      />
      {zone ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-[12px] font-semibold text-emerald-700">
          {t("rider.auth.register.step4.zoneSaved")}: {zone.address || `${zone.lat.toFixed(4)}, ${zone.lng.toFixed(4)}`}.
        </p>
      ) : null}
      {zoneError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-4 text-[13px] font-semibold text-rose-600"
        >
          {zoneError}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 5 — Verify Email + Final Submit                                      */
/* -------------------------------------------------------------------------- */

function VerifyStep({
  email,
  otp,
  setOtp,
  errors,
  apiError,
  t,
}: {
  email: string;
  otp: string;
  setOtp: (next: string) => void;
  errors: RegisterErrors;
  apiError: string | null;
  t: TFn;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("rider.auth.register.step5.title")}
        </span>
        <p className="text-[13px] font-normal leading-snug text-ink-muted">
          {t("rider.auth.register.step5.subtitle")}{" "}
          <span className="font-semibold text-ink">
            {email || t("rider.auth.register.step5.subtitleFallback")}
          </span>{" "}
          {/* Trailing "to confirm it's you" copy */}
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
        email={email}
        value={otp}
        onChange={setOtp}
        error={errors.otp}
      />
    </div>
  );
}