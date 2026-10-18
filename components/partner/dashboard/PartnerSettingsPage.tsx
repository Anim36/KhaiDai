"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProfilePictureSection } from "@/components/profile/ProfilePictureSection";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { PartnerSettingsHeader } from "@/components/partner/dashboard/PartnerSettingsHeader";
import {
  ContactInfoSection,
  NotificationsSection,
  RestaurantProfileSection,
} from "@/components/partner/dashboard/SettingsSections";
import {
  PartnerChangeRequestModal,
  type LatestPartnerChangeRequest,
} from "@/components/partner/dashboard/PartnerChangeRequestModal";
import { PaymentAccountsSection } from "@/components/partner/dashboard/PaymentAccountsSection";
import { SettingsSubmitButton } from "@/components/partner/dashboard/SettingsForm";
import {
  cuisineOptions,
  type NotificationPreferences,
  type Settings,
} from "@/data/partner-settings";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Empty form state used while we're loading the restaurant row, or
 * when the partner hasn't created a restaurant yet.
 */
const EMPTY_SETTINGS: Settings = {
  profile: {
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    cuisine: cuisineOptions[0],
    hours: "",
    coverImage: "",
  },
  contact: { ownerName: "", phone: "", email: "" },
  notifications: {
    newOrders: true,
    dailyEarningsDigest: true,
    reviewAlerts: false,
  },
};

/**
 * Orchestrator for /partner/settings.
 *
 * Loads the partner's restaurant on mount (`GET /api/restaurants/me`)
 * and seeds the form from the real row — no more hardcoded
 * "Spice Junction / Tanvir" demo data. Save Changes PATCHes
 * `/api/restaurants/[id]` with the edited fields so updates persist
 * and reflect on the Partner Dashboard the next time it loads.
 *
 * Layout: 260px sidebar + main column = header + 4 sections in a
 * sticky-bottom save bar.
 */
export function PartnerSettingsPage() {
  return (
    <RequireAuth role="PARTNER">
      <PartnerSettingsContent />
    </RequireAuth>
  );
}

function PartnerSettingsContent() {
  const t = useT();
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "saved" | "error"
  >("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // কাজ ২ — partner "Contact support" re-entry flags. Reflected
  // back from the restaurant payload on every load so the form
  // shows the same state the server has.
  const [needsProfileReentry, setNeedsProfileReentry] = useState(false);
  const [needsLocationReentry, setNeedsLocationReentry] = useState(false);
  // কাজ ২ — latest request per group, used for pending badges +
  // rejected banners. Mirrors the rider flow's `latestRequests`
  // shape so the Settings UI can use the same render pattern.
  const [latestProfileRequest, setLatestProfileRequest] =
    useState<LatestPartnerChangeRequest | null>(null);
  const [latestLocationRequest, setLatestLocationRequest] =
    useState<LatestPartnerChangeRequest | null>(null);
  // কাজ ২ — modal control. `null` = closed; otherwise the modal is
  // open and rendering for that group.
  const [openRequestType, setOpenRequestType] = useState<
    "RESTAURANT_PROFILE" | "RESTAURANT_LOCATION" | null
  >(null);

  // Refresh just the request list — called after submitting a new
  // request so the badge flips from "open modal" to "pending".
  async function refreshLatestRequests() {
    try {
      const res = await apiFetch<{
        latestByType: {
          RESTAURANT_PROFILE: LatestPartnerChangeRequest | null;
          RESTAURANT_LOCATION: LatestPartnerChangeRequest | null;
        };
      }>("/api/partner/profile-change-request");
      if (!res.ok) return;
      const latestByType = res.data?.latestByType ?? {
        RESTAURANT_PROFILE: null,
        RESTAURANT_LOCATION: null,
      };
      setLatestProfileRequest(latestByType.RESTAURANT_PROFILE);
      setLatestLocationRequest(latestByType.RESTAURANT_LOCATION);
    } catch {
      /* silent — banner is a nice-to-have, not a hard requirement */
    }
  }

  // ---- load on mount ----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch<{
        restaurant: {
          id: string;
          name: string;
          address: string;
          cuisine: string;
          openingHours: string;
          coverImage: string | null;
        };
        profileNeedsReentry?: boolean;
        locationNeedsReentry?: boolean;
        latitude?: number | null;
        longitude?: number | null;
      }>("/api/restaurants/me");
      if (cancelled) return;
      if (res.status === 204 || !res.ok) {
        setLoaded(true);
        return;
      }
      const r = res.data?.restaurant;
      if (!r) {
        setLoaded(true);
        return;
      }
      setRestaurantId(r.id);
      // কাজ ২ — capture the latest lock-flag state so the form
      // renders the same way the server sees it.
      setNeedsProfileReentry(Boolean(res.data?.profileNeedsReentry));
      setNeedsLocationReentry(Boolean(res.data?.locationNeedsReentry));
      setSettings((prev) => ({
        profile: {
          name: r.name ?? "",
          address: r.address ?? "",
          // Map pin lat/lng — only present when the partner has
          // dropped a pin via the AddressPicker. Otherwise null so
          // the picker defaults to Dhaka on next open.
          latitude:
            typeof res.data?.latitude === "number"
              ? res.data.latitude
              : prev.profile.latitude ?? null,
          longitude:
            typeof res.data?.longitude === "number"
              ? res.data.longitude
              : prev.profile.longitude ?? null,
          // Persisted cuisine may not match the closed enum; fall back
          // to the first option so the <select> always has a value.
          cuisine: (cuisineOptions as readonly string[]).includes(r.cuisine)
            ? r.cuisine
            : cuisineOptions[0],
          hours: r.openingHours ?? "",
          coverImage: r.coverImage ?? "",
        },
        contact: {
          ownerName: user?.name ?? "",
          phone: user?.phone ?? "",
          email: user?.email ?? "",
        },
        notifications: prev.notifications,
      }));
      setLoaded(true);
    }
    load()
      .then(() => {
        // কাজ ২ — also seed the latest change-request row per
        // group so the pending badge / rejected banner show on
        // first paint without waiting for the user to open the
        // modal first.
        void refreshLatestRequests();
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProfileChange = (profile: Settings["profile"]) => {
    setSubmitState("idle");
    setSettings((prev) => ({ ...prev, profile }));
  };
  const handleContactChange = (contact: Settings["contact"]) => {
    setSubmitState("idle");
    setSettings((prev) => ({ ...prev, contact }));
  };
  const handleNotificationsChange = (
    notifications: NotificationPreferences,
  ) => {
    setSubmitState("idle");
    setSettings((prev) => ({ ...prev, notifications }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitState === "submitting") return;
    if (!restaurantId) {
      setSubmitState("error");
      setSubmitError(
        t("partner.settings.sectionsPage.save.createRestaurantFirst"),
      );
      return;
    }
    setSubmitState("submitting");
    setSubmitError(null);
    const payload: Record<string, unknown> = {
      name: settings.profile.name.trim(),
      address: settings.profile.address.trim(),
      cuisine: settings.profile.cuisine.trim(),
      openingHours: settings.profile.hours.trim(),
      coverImage: settings.profile.coverImage.trim() || null,
    };
    // কাজ ২ — include the map pin so the partner can relocate via
    // the AddressPicker. The PATCH handler ignores them when the
    // partner isn't allowed to edit location.
    if (settings.profile.latitude !== null) {
      payload.latitude = settings.profile.latitude;
    }
    if (settings.profile.longitude !== null) {
      payload.longitude = settings.profile.longitude;
    }
    const res = await apiFetch<{
      restaurant?: { profileNeedsReentry?: boolean; locationNeedsReentry?: boolean };
    }>(`/api/restaurants/${restaurantId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setSubmitState("error");
      setSubmitError(res.error.message);
      return;
    }
    // কাজ ২ — keep the lock flags in sync with the server's fresh
    // state. APPROVE flips them to true (we don't see that here
    // because the admin's queue is the only path); saving fresh
    // values here flips them back to false. The PATCH endpoint
    // returns the new flag values so we don't need a follow-up fetch.
    if (typeof res.data?.restaurant?.profileNeedsReentry === "boolean") {
      setNeedsProfileReentry(res.data.restaurant.profileNeedsReentry);
    }
    if (typeof res.data?.restaurant?.locationNeedsReentry === "boolean") {
      setNeedsLocationReentry(res.data.restaurant.locationNeedsReentry);
    }
    // Re-load the saved row so the form reflects whatever the server
    // persisted. This makes the "Save Changes" round-trip visible
    // without requiring the partner to navigate away and back — and
    // catches any field the server normalised differently (e.g.
    // trimming, default substitutions).
    await reloadFromServer();
    setSubmitState("saved");
  };

  /**
   * Re-fetch the partner's restaurant from `/api/restaurants/me` and
   * seed the form fields from the response. Used after PATCH so the
   * saved values replace whatever the partner typed (in case the
   * server normalised them).
   */
  const reloadFromServer = async () => {
    const res = await apiFetch<{
      restaurant: {
        name: string;
        address: string;
        cuisine: string;
        openingHours: string;
        coverImage: string | null;
      };
      latitude?: number | null;
      longitude?: number | null;
      profileNeedsReentry?: boolean;
      locationNeedsReentry?: boolean;
    }>("/api/restaurants/me");
    if (res.status === 204 || !res.ok || !res.data?.restaurant) return;
    const r = res.data.restaurant;
    setSettings((prev) => ({
      profile: {
        name: r.name ?? "",
        address: r.address ?? "",
        latitude:
          typeof res.data?.latitude === "number"
            ? res.data.latitude
            : prev.profile.latitude,
        longitude:
          typeof res.data?.longitude === "number"
            ? res.data.longitude
            : prev.profile.longitude,
        cuisine: (cuisineOptions as readonly string[]).includes(r.cuisine)
          ? r.cuisine
          : cuisineOptions[0],
        hours: r.openingHours ?? "",
        coverImage: r.coverImage ?? "",
      },
      contact: prev.contact,
      notifications: prev.notifications,
    }));
    setNeedsProfileReentry(Boolean(res.data?.profileNeedsReentry));
    setNeedsLocationReentry(Boolean(res.data?.locationNeedsReentry));
  };

  return (
    <PartnerShell activeKey="settings">
      <PartnerSettingsHeader />

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-6 p-8"
        >
          <RestaurantProfileSection
            value={settings.profile}
            onChange={handleProfileChange}
            latestProfileRequest={latestProfileRequest}
            latestLocationRequest={latestLocationRequest}
            needsProfileReentry={needsProfileReentry}
            needsLocationReentry={needsLocationReentry}
            onOpenRequest={setOpenRequestType}
          />

          <ProfilePictureSection
            userId={user?.id}
            userName={user?.name}
            description={t(
              "partner.settings.sectionsPage.payment.ownerPhotoDescription",
            )}
          />

          <ContactInfoSection
            value={settings.contact}
            onChange={handleContactChange}
          />

          <NotificationsSection
            value={settings.notifications}
            onChange={handleNotificationsChange}
          />

          <PaymentAccountsSection
            apiBase="/api/partner/payment-accounts"
            i18nPrefix="partner.settings.sectionsPage.payment"
          />

          {submitError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
            >
              {submitError}
            </div>
          ) : null}

          <div className="sticky bottom-0 -mx-8 mt-2 flex flex-col gap-3 border-t border-line bg-white px-8 py-4 md:flex-row md:items-center md:justify-end">
            {submitState === "saved" ? (
              <span className="inline-flex w-fit items-center rounded-full bg-[#dcfce7] px-3 py-1 text-[12px] font-semibold text-[#16a34a]">
                {t("partner.settings.sectionsPage.save.saved")}
              </span>
            ) : null}
            <SettingsSubmitButton
              pending={submitState === "submitting"}
              disabled={!loaded}
            >
              {t("partner.common.saveChanges")}
            </SettingsSubmitButton>
          </div>
        </form>

      {openRequestType ? (
        <PartnerChangeRequestModal
          open
          requestType={openRequestType}
          onClose={() => setOpenRequestType(null)}
          onSubmitted={() => {
            void refreshLatestRequests();
          }}
        />
      ) : null}
    </PartnerShell>
  );
}