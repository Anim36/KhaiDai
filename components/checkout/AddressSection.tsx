"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinAddressIcon } from "@/components/icons";
import {
  ClientOnlyAddressPicker as AddressPicker,
  PickedAddress,
} from "@/components/map/ClientOnlyAddressPicker";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Wire shape                                                                */
/* -------------------------------------------------------------------------- */

type WireAddress = {
  id: string;
  label: string;
  fullAddress: string;
  city: string;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
};

const LABEL_KEYS = ["HOME", "WORK", "OTHER"] as const;
type LabelKey = (typeof LABEL_KEYS)[number];

/**
 * Look up the localised label for an address. Falls back to the raw
 * `label` value (e.g. "OTHER" / a partner-defined tag) when the
 * incoming key isn't one of the three canonical buckets — that way
 * a future label won't crash the page.
 */
type LookupFn = (key: any) => string;
function labelLabel(t: LookupFn, raw: string): string {
  if ((LABEL_KEYS as readonly string[]).includes(raw)) {
    return t(`addressSection.labels.${raw}`);
  }
  return raw;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * "{t("addressSection.title")}" card on the checkout page.
 *
 *   • Loads the signed-in customer's saved addresses from
 *     `/api/addresses` and surfaces the default one as the active
 *     selection.
 *   • Lets the customer pick another saved address via the dropdown.
 *   • The "Add new with map" button opens the Leaflet/AddressPicker
 *     modal, where the user can search, drag, or use their current
 *     location. On confirm we POST to `/api/addresses` (lat/lng
 *     included) and immediately select the new row — this is the
 *     Foodpanda / Wolt pattern of letting the pin double as a saved
 *     address so it shows up next time.
 *   • The parent checkout picks up `onAddressChange(fullAddress)` so
 *     it can POST the right `deliveryAddress` to /api/orders.
 *
 * Visual language matches the rest of checkout — same 22px pin,
 * same rounded-card, same brand-tinted section header.
 */
/**
 * Snapshot the address section bubbles up to the checkout
 * orchestrator on every active-selection change. The orchestrator
 * needs the pin coordinates so it can call
 * `GET /api/delivery-fee/estimate?…&lat=…&lng=…` and quote a
 * real fee — without coords the API returns just the platform
 * base fee.
 */
export type ResolvedAddress = {
  fullAddress: string;
  latitude: number | null;
  longitude: number | null;
};

export function AddressSection({
  selectedId,
  onSelect,
  onAddressChange,
}: {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /**
   * Forwarded upward so the parent `CheckoutPage` can include the
   * resolved street text + pin coordinates in its `/api/orders` POST
   * body and in the delivery-fee estimate call. We always fire this
   * so the parent never has to re-derive the value.
   */
  onAddressChange?: (resolved: ResolvedAddress) => void;
}) {
  const t = useT();
  const [addresses, setAddresses] = useState<WireAddress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerLabel, setPickerLabel] = useState<LabelKey>("HOME");

  const reload = useCallback(async () => {
    const res = await apiFetch<{ addresses?: WireAddress[] }>(
      "/api/addresses",
    );
    if (res.ok && Array.isArray(res.data?.addresses)) {
      setAddresses(res.data.addresses);
    } else if (!res.ok) {
      setError(res.error.message);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Pick a sensible default: explicit `selectedId` > the row marked
  // `isDefault: true` > the most-recent row.
  const effectiveId = useMemo<string | null>(() => {
    if (selectedId !== undefined) return selectedId;
    if (addresses.length === 0) return null;
    const def = addresses.find((a) => a.isDefault);
    return def ? def.id : addresses[0].id;
  }, [selectedId, addresses]);

  const selected = useMemo(
    () => addresses.find((a) => a.id === effectiveId) ?? null,
    [addresses, effectiveId],
  );

  // Bubble the resolved address (street text + pin coordinates)
  // upward whenever the active selection changes. We deliberately
  // fire on every change — including the moment the saved-address
  // list first arrives — so the orchestrator can immediately
  // re-quote the delivery fee with the right coords.
  useEffect(() => {
    if (!onAddressChange) return;
    if (selected) {
      onAddressChange({
        fullAddress: selected.fullAddress,
        latitude: selected.latitude,
        longitude: selected.longitude,
      });
    }
  }, [selected, onAddressChange]);

  /* ---------------- confirm: save the picked pin as a row ---------------- */

  async function handleConfirmPicked(picked: PickedAddress) {
    setPickerSaving(true);
    setPickerError(null);
    try {
      const res = await apiFetch<{ address: WireAddress }>("/api/addresses", {
        method: "POST",
        body: JSON.stringify({
          label: pickerLabel,
          fullAddress: picked.fullAddress,
          city: picked.city || "Dhaka",
          area: picked.area ?? null,
          latitude: picked.latitude,
          longitude: picked.longitude,
          // First saved address always wins the default flag so the
          // next checkout is a single tap.
          isDefault: addresses.length === 0,
        }),
      });
      if (!res.ok || !res.data?.address) {
        setPickerError(res.ok ? t("addressSection.saveErrorEmptyHint") : res.error.message);
        return;
      }
      const created = res.data.address;
      // Optimistically prepend so the dropdown updates without a reload,
      // then refresh from the server in the background.
      setAddresses((prev) => {
        const others = prev.filter((a) => a.id !== created.id);
        return [created, ...others];
      });
      onSelect?.(created.id);
      setPickerOpen(false);
      void reload();
    } catch (err) {
      setPickerError(
        err instanceof Error ? err.message : t("addressSection.saveFailed"),
      );
    } finally {
      setPickerSaving(false);
    }
  }

  return (
    <section className="w-full rounded-card border border-line bg-white p-7">
      <div className="flex w-full items-center justify-between">
        <h2 className="font-display text-[20px] font-extrabold leading-none text-ink">
          {t("addressSection.title")}
        </h2>
        <a
          href="/profile?tab=addresses"
          className="font-display text-[13px] font-bold leading-none text-brand hover:underline"
        >
          {t("addressSection.manage")}
        </a>
      </div>

      <div className="mt-5 flex w-full items-start gap-4">
        <div className="flex shrink-0 items-start rounded-3xl bg-brand-100 p-3">
          <MapPinAddressIcon size={22} className="text-brand" />
        </div>
        <div className="flex flex-1 flex-col gap-2 leading-none">
          {selected ? (
            <>
              <p className="w-full font-display text-[16px] font-bold text-ink">
                {t("addressSection.homeAddress", {
                  label: labelLabel(t, selected.label),
                })}
              </p>
              <p className="w-full text-[14px] font-normal text-ink-muted">
                {selected.fullAddress}
              </p>
              <p className="text-[13px] font-normal text-ink-muted">
                {selected.area ? `${selected.area}, ` : ""}
                {selected.city}
              </p>
              {selected.latitude !== null && selected.longitude !== null ? (
                <p className="text-[11px] font-medium text-ink-muted">
                  {t("addressSection.pinnedOnMap", {
                    lat: selected.latitude.toFixed(4),
                    lng: selected.longitude.toFixed(4),
                  })}
                </p>
              ) : null}
            </>
          ) : loaded ? (
            <div className="flex flex-col gap-1">
              <p className="font-display text-[15px] font-bold text-ink">
                {t("addressSection.noSavedAddressTitle")}
              </p>
              <p className="text-[13px] font-normal text-ink-muted">
                {t("addressSection.noSavedAddressHint")}
              </p>
            </div>
          ) : (
            <p className="text-[13px] font-normal text-ink-muted">
              {t("addressSection.loadingAddresses")}
            </p>
          )}
        </div>
      </div>

      {/* Selector — only when there's actually something to choose
          between. Lets the customer pick a non-default address for
          a one-off delivery. */}
      {addresses.length > 1 ? (
        <div className="mt-5 flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("addressSection.orPickAnother")}
          </span>
          <select
            value={effectiveId ?? ""}
            onChange={(e) => onSelect?.(e.target.value || null)}
            className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {labelLabel(t, a.label) + " — " + a.fullAddress}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Map picker CTA */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-ink-muted">
          {t("addressSection.pinHelper")}
        </p>
        <button
          type="button"
          onClick={() => {
            setPickerError(null);
            setPickerOpen(true);
          }}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-bold text-white hover:brightness-105"
        >
          {addresses.length === 0
            ? t("addressSection.addAddressOnMap")
            : t("addressSection.addNewOnMap")}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-[12px] font-semibold text-amber-700">
          {t("addressSection.refreshError", { message: error })}
        </p>
      ) : null}

      {pickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("addressSection.modalAria")}
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 px-3 py-6 sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pickerSaving) setPickerOpen(false);
          }}
        >
          <div className="flex w-full max-w-3xl flex-col gap-3">
            <div className="rounded-card border border-line bg-white p-3 shadow-card sm:p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {t("addressSection.addressPickerPlaceholder")}
              </p>
              <div className="flex flex-wrap gap-2">
                {LABEL_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPickerLabel(k)}
                    className={
                      "h-9 rounded-full px-4 text-[12px] font-bold transition " +
                      (pickerLabel === k
                        ? "bg-brand text-white"
                        : "border border-line bg-white text-ink hover:border-brand")
                    }
                  >
                    {t(`addressSection.labels.${k}`)}
                  </button>
                ))}
              </div>
              {pickerError ? (
                <p className="mt-2 text-[12px] font-semibold text-rose-700">
                  {pickerError}
                </p>
              ) : null}
            </div>

            <AddressPicker
              initial={
                selected && selected.latitude !== null && selected.longitude !== null
                  ? {
                      latitude: selected.latitude,
                      longitude: selected.longitude,
                      fullAddress: selected.fullAddress,
                    }
                  : null
              }
              onConfirm={handleConfirmPicked}
              onCancel={() => (pickerSaving ? undefined : setPickerOpen(false))}
              confirmLabel={
                pickerSaving
                  ? t("addressSection.savingLabel")
                  : t("addressSection.saveAndUse")
              }
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
