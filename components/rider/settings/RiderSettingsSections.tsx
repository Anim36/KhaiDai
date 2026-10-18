"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  SettingsSelect,
  SettingsTextField,
} from "@/components/partner/dashboard/SettingsForm";
import { ToggleSwitch } from "@/components/partner/dashboard/ToggleSwitch";
import { BanknoteIcon } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/LocaleProvider";
import { apiFetch } from "@/lib/apiClient";
import {
  notificationToggleMeta,
  payoutMethods,
  vehicleTypes,
  type NotificationPreferences,
  type PayoutInfo,
  type RiderProfileForm,
  type VehicleInfo,
  type SettingsErrors,
} from "@/data/rider-settings";
import {
  ChangeRequestModal,
  EditableAfterApprovalBanner,
  PendingChangeRequestBadge,
  RejectedChangeRequestBanner,
  type LatestChangeRequest,
} from "./ChangeRequestModal";

/* -------------------------------------------------------------------------- */
/*  Profile section                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Profile block — read-only by default. When the rider's
 * PROFILE_INFO change request has been approved by an admin
 * (mirrored via `rider.profileNeedsReentry` from /api/riders/me),
 * the fields turn into editable inputs that PATCH /api/riders/me
 * on Save. On success the flag clears and the section locks
 * itself again.
 *
 * The CTA in the footer is also a button (not a mailto) that
 * opens the <ChangeRequestModal> so the rider can submit the
 * support request in-app.
 */
export function RiderProfileSection({
  value,
  latestRequest,
  needsReentry,
  onSaved,
  onRequestSubmitted,
}: {
  value: RiderProfileForm;
  /** Latest request for this type from
   *  GET /api/riders/profile-change-request. Used for the
   *  "pending review" badge + the rejected banner. */
  latestRequest: LatestChangeRequest;
  /** Mirrors `User.profileNeedsReentry`. When true the fields
   *  become editable; on save the flag clears in the DB and
   *  we drop back to read-only. */
  needsReentry: boolean;
  /** Forwarded upward so the parent can refresh /api/riders/me
   *  after a successful save. */
  onSaved?: () => void;
  /** Lets the parent re-fetch the latest request after a new
   *  submission so the badge appears immediately. */
  onRequestSubmitted?: (requestId: string) => void;
}) {
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);

  // Local edit buffer — kept separate from `value` so a slow
  // re-fetch from the parent doesn't trample the rider's edits.
  const [draft, setDraft] = useState({
    fullName: value.fullName,
    email: value.email,
    phone: value.phone,
  });
  // Re-sync the buffer when the server-side values change
  // (e.g. after `onSaved` triggers a fresh fetch).
  useEffect(() => {
    setDraft({
      fullName: value.fullName,
      email: value.email,
      phone: value.phone,
    });
  }, [value.fullName, value.email, value.phone]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const hasPending = latestRequest?.status === "PENDING";
  const justRejected = latestRequest?.status === "REJECTED";
  const editable = needsReentry && !hasPending;

  const handleSave = useCallback(async () => {
    if (!editable) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch<unknown>("/api/riders/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.fullName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
        }),
      });
      if (!res.ok) {
        setSaveError(
          res.error.message || t("rider.settings.changeRequest.saveError"),
        );
        return;
      }
      setSavedAt(Date.now());
      onSaved?.();
    } catch {
      setSaveError(t("rider.settings.changeRequest.saveError"));
    } finally {
      setSaving(false);
    }
  }, [draft, editable, onSaved, t]);

  const isFieldError = (key: keyof typeof draft): string | null => {
    if (!saveError) return null;
    const lower = saveError.toLowerCase();
    if (key === "fullName" && (lower.includes("name") || lower.includes("required")))
      return saveError;
    if (key === "email" && lower.includes("email")) return saveError;
    if (key === "phone" && lower.includes("phone")) return saveError;
    return null;
  };

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {t("rider.settings.profile.title")}
          </h2>
          {hasPending ? <PendingChangeRequestBadge /> : null}
        </div>
        <p className="text-[12px] text-ink-muted">
          {t("rider.settings.profile.subtitle")}
        </p>
      </header>

      {justRejected && latestRequest ? (
        <RejectedChangeRequestBanner adminNote={latestRequest.adminNote} />
      ) : null}
      {editable ? <EditableAfterApprovalBanner /> : null}

      <div className="flex flex-col gap-5">
        <SettingsTextField
          name="fullName"
          label={t("rider.settings.profile.fullName")}
          value={draft.fullName}
          onChange={(e) =>
            setDraft((d) => ({ ...d, fullName: e.target.value }))
          }
          disabled={!editable}
          error={isFieldError("fullName") ?? undefined}
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SettingsTextField
            name="email"
            type="email"
            label={t("rider.settings.profile.email")}
            value={draft.email}
            onChange={(e) =>
              setDraft((d) => ({ ...d, email: e.target.value }))
            }
            disabled={!editable}
            error={isFieldError("email") ?? undefined}
          />
          <SettingsTextField
            name="phone"
            type="tel"
            label={t("rider.settings.profile.phone")}
            value={draft.phone}
            onChange={(e) =>
              setDraft((d) => ({ ...d, phone: e.target.value }))
            }
            disabled={!editable}
            error={isFieldError("phone") ?? undefined}
          />
        </div>
      </div>

      {editable ? (
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end">
          {saveError && !isFieldError("fullName") && !isFieldError("email") && !isFieldError("phone") ? (
            <p
              role="alert"
              className="text-[12px] font-semibold text-rose-700"
            >
              {saveError}
            </p>
          ) : null}
          {savedAt && !saveError ? (
            <p
              role="status"
              className="text-[12px] font-semibold text-emerald-700"
            >
              {t("rider.settings.changeRequest.saved")}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            data-action="save-profile"
            className="h-11 rounded-xl bg-brand px-5 text-[13px] font-bold text-white hover:brightness-105 disabled:opacity-60"
          >
            {saving
              ? t("rider.settings.changeRequest.saving")
              : t("rider.settings.changeRequest.saveChanges")}
          </button>
        </div>
      ) : null}

      <p className="text-[12px] text-ink-muted">
        {t("rider.settings.profile.footerPrompt")}{" "}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          data-action="open-profile-change-request"
          disabled={hasPending}
          className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
        >
          {t("rider.settings.profile.footerLink")}
        </button>
        {t("rider.settings.profile.footerDot")}
      </p>

      <ChangeRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        requestType="PROFILE_INFO"
        onSubmitted={(id) => {
          setModalOpen(false);
          onRequestSubmitted?.(id);
        }}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Vehicle section                                                           */
/* -------------------------------------------------------------------------- */

export function RiderVehicleSection({
  value,
  latestRequest,
  needsReentry,
  onSaved,
  onRequestSubmitted,
}: {
  value: VehicleInfo;
  latestRequest: LatestChangeRequest;
  needsReentry: boolean;
  onSaved?: () => void;
  onRequestSubmitted?: (requestId: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  // Vehicle-type labels live in the registration form (i18n keys
  // `rider.auth.vehicleTypes.{value}`). Re-resolve here so the
  // settings page reads in the current locale.
  const vehicleLabel =
    t(
      `rider.auth.vehicleTypes.${value.type}` as Parameters<typeof t>[0],
      "",
    ) || vehicleTypes.find((v) => v.value === value.type)?.label ||
    value.type;
  void locale;

  const [modalOpen, setModalOpen] = useState(false);

  const [draft, setDraft] = useState({
    type: value.type,
    registrationNumber: value.registrationNumber,
  });
  useEffect(() => {
    setDraft({
      type: value.type,
      registrationNumber: value.registrationNumber,
    });
  }, [value.type, value.registrationNumber]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const hasPending = latestRequest?.status === "PENDING";
  const justRejected = latestRequest?.status === "REJECTED";
  const editable = needsReentry && !hasPending;

  const handleSave = useCallback(async () => {
    if (!editable) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch<unknown>("/api/riders/me", {
        method: "PATCH",
        body: JSON.stringify({
          vehicleType: draft.type,
          vehicleRegNumber: draft.registrationNumber.trim(),
        }),
      });
      if (!res.ok) {
        setSaveError(
          res.error.message || t("rider.settings.changeRequest.saveError"),
        );
        return;
      }
      setSavedAt(Date.now());
      onSaved?.();
    } catch {
      setSaveError(t("rider.settings.changeRequest.saveError"));
    } finally {
      setSaving(false);
    }
  }, [draft, editable, onSaved, t]);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            {t("rider.settings.vehicle.title")}
          </h2>
          {hasPending ? <PendingChangeRequestBadge /> : null}
        </div>
        <p className="text-[12px] text-ink-muted">
          {t("rider.settings.vehicle.subtitle")}
        </p>
      </header>

      {justRejected && latestRequest ? (
        <RejectedChangeRequestBanner adminNote={latestRequest.adminNote} />
      ) : null}
      {editable ? <EditableAfterApprovalBanner /> : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {editable ? (
          <SettingsSelect
            name="vehicleType"
            label={t("rider.settings.vehicle.type")}
            value={draft.type}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                type: e.target.value as VehicleInfo["type"],
              }))
            }
            options={vehicleTypes.map((v) => ({
              value: v.value,
              label: t(
                `rider.auth.vehicleTypes.${v.value}` as Parameters<typeof t>[0],
                "",
              ) || v.label,
            }))}
          />
        ) : (
          <ReadOnlyField
            label={t("rider.settings.vehicle.type")}
            value={vehicleLabel}
          />
        )}
        <SettingsTextField
          name="registrationNumber"
          label={t("rider.settings.vehicle.registrationNumber")}
          value={draft.registrationNumber}
          onChange={(e) =>
            setDraft((d) => ({ ...d, registrationNumber: e.target.value }))
          }
          disabled={!editable}
        />
      </div>

      {editable ? (
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end">
          {saveError ? (
            <p
              role="alert"
              className="text-[12px] font-semibold text-rose-700"
            >
              {saveError}
            </p>
          ) : null}
          {savedAt && !saveError ? (
            <p
              role="status"
              className="text-[12px] font-semibold text-emerald-700"
            >
              {t("rider.settings.changeRequest.saved")}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            data-action="save-vehicle"
            className="h-11 rounded-xl bg-brand px-5 text-[13px] font-bold text-white hover:brightness-105 disabled:opacity-60"
          >
            {saving
              ? t("rider.settings.changeRequest.saving")
              : t("rider.settings.changeRequest.saveChanges")}
          </button>
        </div>
      ) : null}

      <p className="text-[12px] text-ink-muted">
        {t("rider.settings.vehicle.footerPrompt")}{" "}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          data-action="open-vehicle-change-request"
          disabled={hasPending}
          className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
        >
          {t("rider.settings.vehicle.footerLink")}
        </button>
        {t("rider.settings.vehicle.footerDot")}
      </p>

      <ChangeRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        requestType="VEHICLE_INFO"
        onSubmitted={(id) => {
          setModalOpen(false);
          onRequestSubmitted?.(id);
        }}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payout section                                                            */
/* -------------------------------------------------------------------------- */

export function RiderPayoutSection({
  value,
  errors,
  onChange,
}: {
  value: PayoutInfo;
  errors: Pick<SettingsErrors, "payoutDestination" | "accountHolder">;
  onChange: (next: PayoutInfo) => void;
}) {
  const t = useT();
  const isBank = value.method === "bank";
  const destinationLabel = isBank
    ? t("rider.settings.payout.bankAccountNumber")
    : t("rider.settings.payout.mobileWalletNumber");
  const destinationPlaceholder = isBank
    ? t("rider.settings.payout.bankAccountPlaceholder")
    : t("rider.settings.payout.mobileWalletPlaceholder");

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.settings.payout.title")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("rider.settings.payout.subtitle")}
        </p>
      </header>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <SettingsSelect
            name="payoutMethod"
            label={t("rider.settings.payout.method")}
            value={value.method}
            onChange={(e) =>
              onChange({
                ...value,
                method: e.target.value as PayoutInfo["method"],
              })
            }
            options={payoutMethods.map((m) => ({
              value: m.value,
              label: m.label,
            }))}
          />
        </div>
        {/*
          Visual brand cue — pin the official brand mark next to the
          dropdown so the rider immediately recognises the wallet
          they're paying out to. bKash / Nagad / Rocket each have an
          official PNG under /icons; the bank transfer fallback shows
          a generic Banknote glyph.
        */}
        <PayoutMethodBadge method={value.method} />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SettingsTextField
          name="payoutDestination"
          label={destinationLabel}
          type={isBank ? "text" : "tel"}
          value={value.destination}
          onChange={(e) =>
            onChange({ ...value, destination: e.target.value })
          }
          placeholder={destinationPlaceholder}
          error={errors.payoutDestination}
        />
        <SettingsTextField
          name="accountHolder"
          label={t("rider.settings.payout.accountHolder")}
          value={value.accountHolder}
          onChange={(e) =>
            onChange({ ...value, accountHolder: e.target.value })
          }
          error={errors.accountHolder}
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Read-only input                                                          */
/* -------------------------------------------------------------------------- */

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const t = useT();
  return (
    <div className="flex w-full flex-col gap-2">
      <span className="text-[14px] font-semibold text-ink leading-none">
        {label}
      </span>
      <div
        aria-readonly="true"
        className="flex h-12 w-full items-center rounded-xl border border-line bg-surface px-4 text-[14px] font-normal text-ink"
      >
        {value || (
          <span className="text-ink-muted">{t("rider.settings.profile.notSet")}</span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications section                                                     */
/* -------------------------------------------------------------------------- */

export function RiderNotificationsSection({
  value,
  onChange,
  onToast,
  loading = false,
  disabled = false,
}: {
  value: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
  /** Surface a transient toast (success / error). Optional — when
   *  absent the section still works, just without feedback. */
  onToast?: (
    kind: "success" | "error",
    text: string,
  ) => void;
  /** Skeleton state — toggles render as muted placeholders while
   *  the parent is still loading `/api/riders/me`. Click is
   *  suppressed so a rider can't flip a not-yet-loaded pref. */
  loading?: boolean;
  /** Forwarded for symmetry with the partner side; when true the
   *  three toggles are non-interactive (currently always false on
   *  /rider/settings). */
  disabled?: boolean;
}) {
  // Per-toggle pending state so the rest of the section stays
  // interactive while one save is in flight. The optimistic UI
  // applies immediately; the request then either confirms (toast
  // "Saved") or fails (revert + error toast).
  const t = useT();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const handleToggle = async (
    key: keyof NotificationPreferences,
    next: boolean,
  ) => {
    if (disabled || loading) return;
    const previous = value;
    const optimistic: NotificationPreferences = { ...value, [key]: next };
    onChange(optimistic);
    setPending((p) => ({ ...p, [key]: true }));
    try {
      // Use the shared apiFetch wrapper so the bearer token from
      // localStorage is attached automatically. The plain `fetch`
      // form bypasses that and was producing "Missing Authorization
      // header" errors when the user toggled notification
      // preferences while logged in.
      const res = await apiFetch<Record<string, unknown>>(
        "/api/riders/notification-preferences",
        {
          method: "PATCH",
          body: JSON.stringify({ [key]: next }),
        },
      );
      if (!res.ok) {
        // Revert + error toast. The wrapper has already parsed
        // the JSON body and surfaced the server's `error` string
        // via `res.error.message`.
        let msg = t("rider.settings.saveFailed");
        const detail = res.error.message?.trim() ?? "";
        if (detail.length > 0) {
          msg = `${t("rider.settings.notifications.saveErrorPrefix")} ${detail}. ${t("rider.settings.notifications.saveErrorSuffix")}`;
        }
        onChange(previous);
        onToast?.("error", msg);
        return;
      }
      onToast?.("success", t("rider.settings.notifications.savedToast"));
    } catch {
      onChange(previous);
      onToast?.("error", t("rider.settings.saveFailed"));
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("rider.settings.notifications.title")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("rider.settings.notifications.subtitle")}
        </p>
      </header>

      <ul className="flex flex-col">
        {notificationToggleMeta.map((entry, idx) => {
          const isPending = !!pending[entry.key];
          const label = t(
            `rider.settings.notifications.items.${entry.key}.label` as Parameters<typeof t>[0],
            "",
          ) || entry.label;
          const description = t(
            `rider.settings.notifications.items.${entry.key}.description` as Parameters<typeof t>[0],
            "",
          ) || entry.description;
          return (
            <li
              key={entry.key}
              className={
                "flex items-center justify-between gap-4 py-3 " +
                (idx === 0 ? "" : "border-t border-line")
              }
            >
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                  {label}
                  {entry.comingSoon ? (
                    <span className="rounded-full bg-amber-50 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      {t(
                        `rider.settings.notifications.items.${entry.key}.comingSoon` as Parameters<typeof t>[0],
                        "",
                      )}
                    </span>
                  ) : null}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {description}
                </span>
              </div>
              <ToggleSwitch
                on={value[entry.key]}
                disabled={disabled || loading || isPending}
                onChange={(next) => void handleToggle(entry.key, next)}
                ariaLabel={`Toggle ${label}`}
                busy={isPending}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payout-method badge                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Renders the official brand mark for the rider's selected payout
 * method, sitting next to the dropdown so the rider can confirm
 * at a glance which wallet they're sending funds to.
 *
 *   bkash  → /icons/bkash-logo.png
 *   nagad  → /icons/nagad-logo.png
 *   rocket → /icons/rocket-logo.png
 *   bank   → generic Banknote glyph (no official brand mark)
 */
function PayoutMethodBadge({ method }: { method: PayoutInfo["method"] }) {
  const brand =
    method === "bkash"
      ? { src: "/icons/bkash-logo.png", alt: "bKash" }
      : method === "nagad"
        ? { src: "/icons/nagad-logo.png", alt: "Nagad" }
        : method === "rocket"
          ? { src: "/icons/rocket-logo.png", alt: "Rocket" }
          : null;

  return (
    <div
      aria-hidden
      className="relative hidden h-[40px] w-[40px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#fff5f3] sm:flex"
    >
      {brand ? (
        <Image
          src={brand.src}
          alt={brand.alt}
          fill
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <BanknoteIcon size={18} className="text-brand" />
      )}
    </div>
  );
}
