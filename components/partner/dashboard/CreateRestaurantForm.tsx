"use client";

import { useEffect, useState } from "react";
import {
  ClientOnlyAddressPicker as AddressPicker,
  PickedAddress,
} from "@/components/map/ClientOnlyAddressPicker";
import { MapPinAddressIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import { MAX_COVER_BYTES, MAX_COVER_BYTES_MB } from "@/lib/upload-limits";
import { prepareImageForUpload } from "@/lib/clientImage";

/**
 * "Create Your Restaurant" onboarding form for new partners.
 *
 * Shown by `<PartnerDashboardPage />` when `/api/restaurants/me`
 * returns 204. Submits to `POST /api/restaurants` and, on success,
 * invokes the parent's `controller.reload()` so the dashboard
 * re-fetches `/api/restaurants/me` and transitions from the
 * onboarding form to the populated layout (with the real name +
 * cover image the partner just saved).
 *
 * The address field is now backed by the same Leaflet/AddressPicker
 * modal that customers use. Picking a pin fills the `address`
 * textarea AND stamps `latitude`/`longitude` on the POST so the
 * customer's listing can compute distance and rank by it.
 */

export interface CreateRestaurantController {
  reload: () => Promise<void> | void;
}

type FormState = {
  name: string;
  address: string;
  cuisine: string;
  deliveryTime: number;
  openingHours: string;
  coverImage: string;
  latitude: number | null;
  longitude: number | null;
};

const empty: FormState = {
  name: "",
  address: "",
  cuisine: "Bangladeshi",
  deliveryTime: 30,
  openingHours: "10:00 AM – 11:00 PM",
  coverImage: "",
  latitude: null,
  longitude: null,
};
// `deliveryFee` was previously a per-restaurant field. The
// platform now owns the fee schedule (see `DeliveryFeeConfig`)
// so partners no longer pick one on create/edit. The column is
// kept on the schema for historical reasons but the field is
// removed from this form.

const cuisineOptions = [
  "Bangladeshi",
  "Indian",
  "Chinese & Thai",
  "Burgers & Pizza",
  "Sweets & Desserts",
  "Healthy Foods",
  "Other",
] as const;

export function CreateRestaurantForm({
  controller,
}: {
  controller: CreateRestaurantController;
}) {
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  // Reset error as soon as the user changes a field.
  useEffect(() => {
    if (error) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const onCoverFile = async (file: File | null) => {
    setCoverError(null);
    if (!file) return;
    setCoverBusy(true);
    try {
      // `prepareImageForUpload` runs the image through the canvas
      // compressor (max 1600 px, JPEG q=0.82). Even a 6 MB phone
      // photo lands well under the 1.5 MB post-compression cap
      // that keeps the data URL inside Vercel's 4.5 MB body limit.
      const dataUrl = await prepareImageForUpload(file);
      if (dataUrl.length > MAX_COVER_BYTES) {
        setCoverError(
          `Image is still too large after compression (max ${MAX_COVER_BYTES_MB} MB). Try a smaller file.`,
        );
        return;
      }
      setForm((prev) => ({ ...prev, coverImage: dataUrl }));
    } catch (err) {
      setCoverError(
        err instanceof Error
          ? err.message
          : `Image is too large. Try a smaller file.`,
      );
    } finally {
      setCoverBusy(false);
    }
  };

  function handlePicked(picked: PickedAddress) {
    setForm((prev) => ({
      ...prev,
      address: picked.fullAddress,
      latitude: picked.latitude,
      longitude: picked.longitude,
    }));
    setMapOpen(false);
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    // ---- client-side validation ------------------------------------
    if (!form.name.trim() || form.name.trim().length < 2) {
      setError("Restaurant name must be at least 2 characters.");
      return;
    }
    if (!form.address.trim() || form.address.trim().length < 4) {
      setError(
        "Address is required. Pick your restaurant's location on the map.",
      );
      return;
    }
    if (!form.cuisine.trim()) {
      setError("Cuisine is required.");
      return;
    }
    if (!Number.isFinite(form.deliveryTime) || form.deliveryTime < 5) {
      setError("Delivery time must be at least 5 minutes.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      address: form.address.trim(),
      cuisine: form.cuisine.trim(),
      deliveryTime: Number(form.deliveryTime),
      openingHours: form.openingHours.trim(),
      coverImage: form.coverImage.trim() || null,
    };
    // Delivery fee is no longer partner-controlled — the platform
    // owns the schedule. We deliberately don't send `deliveryFee`
    // so the API doesn't see one.
    if (form.latitude !== null) payload.latitude = form.latitude;
    if (form.longitude !== null) payload.longitude = form.longitude;

    const res = await apiFetch<{ restaurant: unknown }>(
      "/api/restaurants",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await controller.reload();
  };

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-white p-8">
      <header className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-pill bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-brand">
          Onboarding
        </span>
        <h2 className="font-display text-[24px] font-extrabold text-ink">
          Create your restaurant
        </h2>
        <p className="text-[14px] text-ink-muted">
          Tell us about your restaurant — once saved, your dashboard will
          light up with the right menu management, orders, and earnings
          views for your kitchen.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {/* Name + cuisine */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              Restaurant name
            </span>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g. Spice Junction"
              className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              Cuisine
            </span>
            <select
              value={form.cuisine}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, cuisine: e.target.value }))
              }
              className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {cuisineOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Address + map picker */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
            Restaurant address
          </span>
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
            <div className="flex min-h-[80px] flex-1 items-start gap-3 rounded-xl border border-line bg-white p-4">
              <span
                aria-hidden
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand"
              >
                <MapPinAddressIcon size={20} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-medium leading-snug text-ink">
                  {form.address.trim() || "No location picked yet"}
                </span>
                {form.latitude !== null && form.longitude !== null ? (
                  <span className="text-[12px] text-ink-muted">
                    Pinned at {form.latitude.toFixed(4)},{" "}
                    {form.longitude.toFixed(4)}
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-muted">
                    Use the map so customers can find your restaurant
                    within their delivery radius.
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 md:w-[200px]"
            >
              {form.address.trim() ? "Change location" : "Pick on map"}
            </button>
          </div>
        </div>

        {/* Delivery time + fee + opening hours */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              Delivery time (minutes)
            </span>
            <input
              required
              type="number"
              min={5}
              max={180}
              value={form.deliveryTime}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  deliveryTime: Number(e.target.value) || 0,
                }))
              }
              className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {/* Delivery fee input removed — the platform owns the
              schedule via DeliveryFeeConfig (see step 5 of the
              rider overhaul). The figure the customer sees at
              checkout comes from the haversine(restaurant, customer)
              formula plus the active config row, never from the
              partner restaurant form. */}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              Opening hours
            </span>
            <input
              type="text"
              value={form.openingHours}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  openingHours: e.target.value,
                }))
              }
              placeholder="10:00 AM – 11:00 PM"
              className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
        </div>

        {/* Cover image */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
            Cover image
          </span>
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <div className="relative h-[120px] w-full overflow-hidden rounded-xl bg-surface md:w-[200px]">
              {form.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.coverImage}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[12px] text-ink-muted">
                  No image
                </div>
              )}
            </div>
            <label className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:text-ink">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onCoverFile(e.target.files?.[0] ?? null)}
              />
              {form.coverImage ? "Replace image" : "Upload image"}
            </label>
            {form.coverImage ? (
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, coverImage: "" }))
                }
                className="inline-flex h-12 items-center justify-center rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink-muted hover:border-rose-300 hover:text-rose-600"
              >
                Remove
              </button>
            ) : null}
          </div>
          {coverBusy ? (
            <span className="text-[12px] text-ink-muted">Reading file…</span>
          ) : coverError ? (
            <span className="text-[12px] font-semibold text-rose-600">
              {coverError}
            </span>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand"
          >
            {error}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-6 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create restaurant"}
          </button>
        </div>
      </form>

      {mapOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pick your restaurant location on the map"
          className="fixed inset-0 z-[2100] flex items-end justify-center bg-black/60 px-3 py-6 sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMapOpen(false);
          }}
        >
          <div className="w-full max-w-3xl">
            <AddressPicker
              initial={
                form.latitude !== null && form.longitude !== null
                  ? {
                      latitude: form.latitude,
                      longitude: form.longitude,
                      fullAddress: form.address,
                    }
                  : null
              }
              onConfirm={handlePicked}
              onCancel={() => setMapOpen(false)}
              confirmLabel="Use this location"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
