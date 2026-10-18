"use client";

import { ImageIcon } from "@/components/icons";
import { ToggleSwitch } from "@/components/partner/dashboard/ToggleSwitch";
import {
  SettingsSelect,
  SettingsTextField,
  SettingsTextarea,
} from "@/components/partner/dashboard/SettingsForm";
import { AddressPicker } from "@/components/maps/AddressPicker";
import {
  PartnerEditableAfterApprovalBanner,
  PartnerPendingChangeRequestBadge,
  PartnerRejectedChangeRequestBanner,
  type LatestPartnerChangeRequest,
} from "@/components/partner/dashboard/PartnerChangeRequestModal";
import {
  cuisineOptions,
  notificationToggleMeta,
  type NotificationPreferences,
  type RestaurantProfile,
  type Settings,
} from "@/data/partner-settings";
import { MAX_COVER_BYTES, MAX_COVER_BYTES_MB } from "@/lib/upload-limits";
import { prepareImageForUpload } from "@/lib/clientImage";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import enMessages from "@/messages/en.json";
import bnMessages from "@/messages/bn.json";

/* -------------------------------------------------------------------------- */
/*  Restaurant profile section                                                */
/* -------------------------------------------------------------------------- */

export function RestaurantProfileSection({
  value,
  onChange,
  // কাজ ২ — partner lock props. Two independent groups:
  //   profile group  → name / cuisine / cover image
  //   location group → address / latitude / longitude
  // Each is unlocked (editable) only when its needs-reentry flag
  // is set AND no PENDING request exists for that group.
  latestProfileRequest,
  latestLocationRequest,
  needsProfileReentry,
  needsLocationReentry,
  onOpenRequest,
}: {
  value: RestaurantProfile;
  onChange: (next: RestaurantProfile) => void;
  latestProfileRequest: LatestPartnerChangeRequest | null;
  latestLocationRequest: LatestPartnerChangeRequest | null;
  needsProfileReentry: boolean;
  needsLocationReentry: boolean;
  onOpenRequest: (
    type: "RESTAURANT_PROFILE" | "RESTAURANT_LOCATION",
  ) => void;
}) {
  const t = useT();
  // Cuisine options are an array, so they can't ride the typed `t()`
  // helper. We resolve them straight out of the matching locale
  // dictionary and fall back to English if a leaf is missing.
  const { locale } = useLocale();
  const cuisineLabels =
    locale === "bn"
      ? (bnMessages.partner.settings.sectionsPage.profile.cuisineOptions as string[])
      : (enMessages.partner.settings.sectionsPage.profile.cuisineOptions as string[]);

  // Cover-image handler — FileReader gives us a data URL so the new
  // image renders immediately without a server upload. We use a plain
  // <img> tag (not `next/image`) because data-URLs occasionally fail
  // Next's optimiser pipeline and the partner needs to see their
  // upload the moment they pick it.
  const handleCoverFile = async (file: File | null) => {
    if (!file) return;
    try {
      // Run every pick through the canvas compressor so a 6 MB
      // phone photo lands well under the 1.5 MB post-compression
      // cap and stays inside Vercel's 4.5 MB body limit.
      const dataUrl = await prepareImageForUpload(file);
      if (dataUrl.length > MAX_COVER_BYTES) {
        // Surface the same error the create-restaurant flow does
        // so partners see one consistent message regardless of
        // which surface they're editing from. The actual toast
        // wiring lives in the parent (`PartnerSettingsPage`); here
        // we just bail before reading the file so we never
        // silently overflow the browser's data-URL budget.
        window.alert(
          t("partner.settings.sectionsPage.profile.sizeError").replace(
            "{mb}",
            String(MAX_COVER_BYTES_MB),
          ),
        );
        return;
      }
      // Use a callback-style updater so we always merge against
      // the latest `value`. The previous closure-based spread
      // could overwrite edits the user made in sibling fields
      // between the file pick and the FileReader callback firing.
      onChange({ ...value, coverImage: dataUrl });
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : t("partner.settings.sectionsPage.profile.sizeError").replace(
              "{mb}",
              String(MAX_COVER_BYTES_MB),
            ),
      );
    }
  };

  // কাজ ২ — derive the locked / editable state for each field group.
  //   • "locked" = no needs-reentry flag AND no PENDING request
  //   • "editable" = needs-reentry flag set AND no PENDING request
  // A PENDING request always blocks edits until the admin acts.
  const profileHasPending =
    latestProfileRequest?.status === "PENDING";
  const locationHasPending =
    latestLocationRequest?.status === "PENDING";
  const profileLocked = !needsProfileReentry || profileHasPending;
  const locationLocked = !needsLocationReentry || locationHasPending;

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("partner.settings.sectionsPage.profile.heading")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("partner.settings.sectionsPage.profile.subtitle")}
        </p>
      </header>

      {/* কাজ ২ — Restaurant profile group (name / cuisine / cover). */}
      {latestProfileRequest?.status === "REJECTED" ? (
        <PartnerRejectedChangeRequestBanner
          adminNote={latestProfileRequest.adminNote}
        />
      ) : needsProfileReentry && !profileHasPending ? (
        <PartnerEditableAfterApprovalBanner />
      ) : null}

      {/* Cover image preview + upload. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-ink leading-none">
            {t("partner.settings.sectionsPage.profile.coverImage")}
          </span>
          {profileHasPending ? (
            <PartnerPendingChangeRequestBadge requestType="RESTAURANT_PROFILE" />
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          <div className="relative h-[120px] w-full overflow-hidden rounded-xl bg-surface md:w-[200px]">
            {value.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.coverImage}
                alt="Restaurant cover preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink-muted">
                <ImageIcon size={24} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {profileLocked ? (
              <span
                className="inline-flex h-12 items-center justify-center rounded-xl border border-dashed border-line bg-surface-page px-4 text-[13px] font-semibold text-ink-muted"
                data-locked="coverImage"
              >
                {t("partner.settings.sectionsPage.profile.lockedHint")}
              </span>
            ) : (
              <label className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:text-ink">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) =>
                    handleCoverFile(e.target.files?.[0] ?? null)
                  }
                />
                {value.coverImage
                  ? t("partner.settings.sectionsPage.profile.replaceImage")
                  : t("partner.settings.sectionsPage.profile.uploadImage")}
              </label>
            )}
            {value.coverImage && !profileLocked ? (
              <button
                type="button"
                onClick={() => onChange({ ...value, coverImage: "" })}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:border-rose-300 hover:text-rose-600"
              >
                {t("partner.settings.sectionsPage.profile.remove")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SettingsTextField
          label={t("partner.settings.sectionsPage.profile.name")}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          disabled={profileLocked}
        />
        <SettingsSelect
          label={t("partner.settings.sectionsPage.profile.cuisine")}
          value={value.cuisine}
          onChange={(e) => onChange({ ...value, cuisine: e.target.value })}
          disabled={profileLocked}
          options={cuisineOptions.map((c, idx) => ({
            value: c,
            label: cuisineLabels?.[idx] ?? c,
          }))}
        />
      </div>

      {profileLocked ? (
        <button
          type="button"
          data-action="open-change-request"
          data-request-type="RESTAURANT_PROFILE"
          onClick={() => onOpenRequest("RESTAURANT_PROFILE")}
          className="self-start text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
        >
          {t("partner.settings.changeRequest.needToUpdate")}
        </button>
      ) : null}

      {/* কাজ ২ — Restaurant location group (address / lat / lng).
          The address is now a map picker (AddressPicker) instead of
          a free-text textarea. The picker carries its own internal
          "Use my current location" + search affordances. */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink leading-none">
          {t("partner.settings.sectionsPage.profile.address")}
        </span>
        {locationHasPending ? (
          <PartnerPendingChangeRequestBadge requestType="RESTAURANT_LOCATION" />
        ) : null}
      </div>
      {latestLocationRequest?.status === "REJECTED" ? (
        <PartnerRejectedChangeRequestBanner
          adminNote={latestLocationRequest.adminNote}
        />
      ) : needsLocationReentry && !locationHasPending ? (
        <PartnerEditableAfterApprovalBanner />
      ) : null}
      {locationLocked ? (
        <SettingsTextarea
          label={t("partner.settings.sectionsPage.profile.address")}
          value={value.address}
          onChange={() => {
            /* locked — noop */
          }}
          disabled
        />
      ) : (
        <AddressPicker
          value={
            value.latitude !== null && value.longitude !== null
              ? {
                  lat: value.latitude,
                  lng: value.longitude,
                  address: value.address,
                }
              : value.address
                ? { lat: 0, lng: 0, address: value.address }
                : null
          }
          onChange={(next) => {
            onChange({
              ...value,
              address: next?.address ?? "",
              latitude: next?.lat ?? null,
              longitude: next?.lng ?? null,
            });
          }}
          title={t("partner.settings.sectionsPage.profile.addressPickerTitle")}
          description={t(
            "partner.settings.sectionsPage.profile.addressPickerHint",
          )}
        />
      )}
      {locationLocked ? (
        <button
          type="button"
          data-action="open-change-request"
          data-request-type="RESTAURANT_LOCATION"
          onClick={() => onOpenRequest("RESTAURANT_LOCATION")}
          className="self-start text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
        >
          {t("partner.settings.changeRequest.needToUpdate")}
        </button>
      ) : null}

      <SettingsTextField
        label={t("partner.settings.sectionsPage.profile.hours")}
        value={value.hours}
        onChange={(e) => onChange({ ...value, hours: e.target.value })}
        placeholder={t("partner.settings.sectionsPage.profile.hoursPlaceholder")}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contact info section                                                      */
/* -------------------------------------------------------------------------- */

export function ContactInfoSection({
  value,
  onChange,
}: {
  value: Settings["contact"];
  onChange: (next: Settings["contact"]) => void;
}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("partner.settings.sectionsPage.contact.heading")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("partner.settings.sectionsPage.contact.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SettingsTextField
          label={t("partner.settings.sectionsPage.contact.ownerName")}
          value={value.ownerName}
          onChange={(e) => onChange({ ...value, ownerName: e.target.value })}
        />
        <SettingsTextField
          label={t("partner.settings.sectionsPage.contact.phone")}
          type="tel"
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
      </div>
      <SettingsTextField
        label={t("partner.settings.sectionsPage.contact.email")}
        type="email"
        value={value.email}
        onChange={(e) => onChange({ ...value, email: e.target.value })}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications section                                                    */
/* -------------------------------------------------------------------------- */

export function NotificationsSection({
  value,
  onChange,
}: {
  value: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("partner.settings.sectionsPage.notifications.heading")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {t("partner.settings.sectionsPage.notifications.subtitle")}
        </p>
      </header>

      <ul className="flex flex-col">
        {notificationToggleMeta.map((entry, idx) => {
          const label = t(
            `partner.settings.sectionsPage.notifications.items.${entry.key}.label` as Parameters<typeof t>[0],
          );
          const description = t(
            `partner.settings.sectionsPage.notifications.items.${entry.key}.description` as Parameters<typeof t>[0],
          );
          return (
            <li
              key={entry.key}
              className={
                "flex items-center justify-between gap-4 py-3 " +
                (idx === 0 ? "" : "border-t border-line")
              }
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-ink">
                  {label}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {description}
                </span>
              </div>
              <ToggleSwitch
                on={value[entry.key]}
                onChange={(next) => onChange({ ...value, [entry.key]: next })}
                ariaLabel={t(
                  "partner.settings.sectionsPage.notifications.toggleAria",
                ).replace("{label}", label)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}