"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { RiderPageHeader } from "@/components/rider/dashboard/RiderPageHeader";
import {
  RiderNotificationsSection,
  RiderProfileSection,
  RiderVehicleSection,
} from "@/components/rider/settings/RiderSettingsSections";
import {
  RiderDocumentsSection,
  type RiderDocumentRow,
} from "@/components/rider/settings/RiderDocumentsSection";
import { PaymentAccountsSection } from "@/components/partner/dashboard/PaymentAccountsSection";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ProfilePictureSection } from "@/components/profile/ProfilePictureSection";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";
import { initialSettings } from "@/data/rider-settings";
import type { NotificationPreferences } from "@/data/rider-settings";

/**
 * Server payload shape returned by /api/riders/me after the schema
 * restructure. The payout columns used to live on the User row;
 * they now live on a RiderProfile + RiderPaymentAccount relation.
 */
type RiderMe = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /// Mirrors User.profileNeedsReentry — when true the Profile
  /// section is editable. Cleared after a successful PATCH.
  profileNeedsReentry: boolean;
  vehicleType: string;
  vehicleRegNumber: string;
  /// Mirrors RiderProfile.vehicleNeedsReentry — when true the
  /// Vehicle section is editable. Cleared after a successful PATCH.
  vehicleNeedsReentry: boolean;
  hasVehicle: boolean;
  hasPaymentDetails: boolean;
  notifyNewRequest: boolean;
  notifyPayout: boolean;
  notifyWeeklySummary: boolean;
  defaultAccount: {
    id: string;
    label: string;
    method: string;
    destination: string;
    accountHolder: string;
  } | null;
};

/** Shape returned by `GET /api/riders/profile-change-request`. */
type LatestChangeRequests = {
  PROFILE_INFO: LatestReq | null;
  VEHICLE_INFO: LatestReq | null;
};
type LatestReq = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

/**
 * /rider/settings orchestrator.
 *
 *   • Two-column shell: 260px `RiderSidebar` + flex-1 main.
 *   • Profile + Vehicle sections render **read-only** data fetched
 *     from `/api/riders/me` — registration fields are treated as
 *     authoritative and can only be changed by contacting support.
 *   • "Payment Accounts" is the only inline-CRU**D** section. The
 *     `PaymentAccountsSection` component (shared with the partner
 *     side) drives the inline CRUD against
 *     `/api/riders/payment-details`.
 *   • Notifications: hydrated from `/api/riders/me`. Each toggle
 *     saves immediately via PATCH
 *     `/api/riders/notification-preferences`; the section handles
 *     optimistic update + revert + toasts on its own so this page
 *     just owns the boot-time fetch.
 */
export function RiderSettingsPage() {
  const t = useT();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [riderMe, setRiderMe] = useState<RiderMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Local mirror of the three notification prefs so the toggles
  // can be flipped immediately even before the page knows whether
  // the network round-trip succeeded.
  const [notif, setNotif] = useState<NotificationPreferences>(
    initialSettings.notifications,
  );

  // Tiny inline toast — surface the per-save feedback from the
  // notifications section without dragging in a global provider.
  // `text` is plain English; the section composes the messages.
  const [toast, setToast] = useState<
    | { kind: "success" | "error"; text: string; id: number }
    | null
  >(null);
  const pushToast = useCallback(
    (kind: "success" | "error", text: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToast({ kind, text, id });
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => {
      setToast((cur) => (cur && cur.id === toast.id ? null : cur));
    }, 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [latestRequests, setLatestRequests] = useState<LatestChangeRequests>({
    PROFILE_INFO: null,
    VEHICLE_INFO: null,
  });
  // Documents uploaded at registration time. Read-only here — the
  // page surfaces them so the rider knows what's on file. Future
  // support-request flow will replace these.
  const [documents, setDocuments] = useState<RiderDocumentRow[]>([]);

  const refreshRiderMe = async () => {
    const res = await apiFetch<{ rider: RiderMe }>("/api/riders/me");
    if (!res.ok) {
      setLoadError(res.error.message);
      setRiderMe(null);
      return;
    }
    setLoadError(null);
    const rider = res.data?.rider ?? null;
    setRiderMe(rider);
    if (rider) {
      setNotif({
        notifyNewRequest: rider.notifyNewRequest,
        notifyPayout: rider.notifyPayout,
        notifyWeeklySummary: rider.notifyWeeklySummary,
      });
    }
  };

  /**
   * Pull the latest PENDING / REJECTED change request per
   * requestType. We tolerate failure silently — the Settings page
   * stays usable even if the new endpoint isn't reachable.
   */
  const refreshLatestRequests = useCallback(async () => {
    const res = await apiFetch<{ latestByType: LatestChangeRequests }>(
      "/api/riders/profile-change-request",
    );
    if (res.ok && res.data?.latestByType) {
      setLatestRequests(res.data.latestByType);
    }
  }, []);

  // Bug fix — the previous version of this block had the two
  // `useEffect` calls interleaved (the second one's body was
  // nested inside the first one's callback and the closing braces
  // ended up on the wrong lines). That triggered React's
  // "Invalid hook call" error 20× per page load because the
  // second `useEffect` was being invoked from inside the first
  // one's effect callback — a function that React does not
  // consider a component function, so its internal hook-state
  // tracker rejects the call. The fix is to keep the two effects
  // as siblings of each other (not nested), with their own
  // independent cleanup functions.

  useEffect(() => {
    let cancelled = false;
    refreshRiderMe()
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    refreshLatestRequests().catch(() => {
      // Silent — the Settings page stays usable even if the new
      // endpoint isn't reachable.
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load documents once on mount. The list is read-only here so we
  // never need to re-fetch mid-session.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ documents: RiderDocumentRow[] }>("/api/riders/me/documents")
      .then((res) => {
        if (cancelled || !res.ok) return;
        setDocuments(res.data?.documents ?? []);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(t("rider.settings.logoutConfirm"));
      if (!ok) return;
    }
    logout();
    router.push("/rider/login");
  };

  const profileValues = {
    fullName: riderMe?.name ?? user?.name ?? "",
    email: riderMe?.email ?? user?.email ?? "",
    phone: riderMe?.phone ?? user?.phone ?? "",
    avatar: null as string | null,
  };
  const vehicleValues = {
    type:
      (riderMe?.vehicleType as
        | "bike"
        | "bicycle"
        | "car"
        | undefined) ?? "bike",
    registrationNumber: riderMe?.vehicleRegNumber ?? "",
  };

  return (
    <RequireAuth role="RIDER">
      <RiderShell activeKey="settings">
          <RiderPageHeader
            title={t("rider.settings.headerTitle")}
            subtitle={t("rider.settings.headerSubtitle")}
          />

          <div className="flex flex-1 flex-col gap-6 p-8">
            {loadError ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700"
              >
                {t("rider.settings.loadFailed", { msg: loadError })}{" "}
                {t("rider.settings.loadFailedSuffix")}
              </div>
            ) : null}

            <ProfilePictureSection
              userId={user?.id}
              userName={user?.name}
              description={t("rider.settings.riderPhotoDescription")}
            />

            <RiderProfileSection
              value={profileValues}
              latestRequest={latestRequests.PROFILE_INFO}
              needsReentry={riderMe?.profileNeedsReentry ?? false}
              onSaved={refreshRiderMe}
              onRequestSubmitted={() => {
                void refreshLatestRequests();
              }}
            />

            <RiderVehicleSection
              value={vehicleValues}
              latestRequest={latestRequests.VEHICLE_INFO}
              needsReentry={riderMe?.vehicleNeedsReentry ?? false}
              onSaved={refreshRiderMe}
              onRequestSubmitted={() => {
                void refreshLatestRequests();
              }}
            />

            <RiderDocumentsSection documents={documents} />

            <PaymentAccountsSection
              apiBase="/api/riders/payment-details"
              description={t("rider.settings.paymentAccounts.description")}
            />

            {loaded ? (
              <RiderNotificationsSection
                value={notif}
                onChange={setNotif}
                onToast={pushToast}
              />
            ) : (
              <NotificationsSkeleton />
            )}

            <div className="mt-2 flex flex-col gap-3 border-t border-line pt-5 md:flex-row md:items-center md:justify-end">
              <button
                type="button"
                onClick={handleLogout}
                data-action="logout"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 text-[13px] font-semibold text-rose-500 transition-colors hover:bg-rose-50"
              >
                {t("rider.settings.logout")}
              </button>
            </div>
          </div>
      </RiderShell>

      {/* Toast — anchored bottom-right so it sits clear of the
          bell dropdown on small viewports. Role="status" for the
          success flavour, role="alert" for the error so AT users
          hear it immediately. */}
      {toast ? (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
          className={
            "fixed bottom-6 right-6 z-[1100] max-w-[320px] rounded-xl border px-4 py-3 text-[13px] font-semibold shadow-lg transition-all " +
            (toast.kind === "success"
              ? "border-emerald-200 bg-white text-emerald-700"
              : "border-rose-200 bg-white text-rose-700")
          }
        >
          {toast.text}
        </div>
      ) : null}
    </RequireAuth>
  );
}

/**
 * Skeleton for the Notifications section — three rows of
 * "label + description" placeholders plus a faded toggle on the
 * right, so the layout doesn't jump when the real data lands.
 */
function NotificationsSkeleton() {
  return (
    <section
      aria-hidden
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6"
    >
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 rounded bg-line" />
        <div className="h-3 w-3/4 max-w-full rounded bg-surface" />
      </div>
      <ul className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className={
              "flex items-center justify-between gap-4 py-3 " +
              (i === 0 ? "" : "border-t border-line")
            }
          >
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3 w-2/5 max-w-full rounded bg-line" />
              <div className="h-3 w-3/4 max-w-full rounded bg-surface" />
            </div>
            <div className="h-5 w-9 rounded-full bg-surface" />
          </li>
        ))}
      </ul>
    </section>
  );
}
