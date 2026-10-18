"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type SVGProps } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProfilePictureSection } from "@/components/profile/ProfilePictureSection";
import {
  CreditCardIcon,
  HeartIcon,
  MapPinAddressIcon,
  TicketIcon,
} from "@/components/icons";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { useOrdersFeed, refreshOrdersFeed } from "@/lib/useOrdersFeed";
import { apiFetch } from "@/lib/apiClient";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import type { OrderStatusApi } from "@/lib/orders";
import Image from "next/image";
import { useT } from "@/lib/i18n/LocaleProvider";

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

const SECTION_HEAD =
  "font-display text-[24px] font-extrabold leading-tight text-ink";

/** Pill behind a status badge — matches Figma's green / red swatches. */
function statusClasses(status: OrderStatusApi) {
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-rose-100 text-rose-800";
  // Anything else (preparing / on the way) treated as in-progress
  return "bg-amber-100 text-amber-800";
}

// Status labels are translated inline via `t("orders.status.<value>")` in
// the OrdersPanel render — pulling the dictionary every time keeps the
// panel reactive to the active locale without an extra state layer.

/** True for orders where the tracking page still makes sense. */
function isActive(s: OrderStatusApi): boolean {
  return (
    s === "pending" ||
    s === "preparing" ||
    s === "ready" ||
    s === "picked_up" ||
    s === "on_the_way"
  );
}

function PlusIcon({ size = 16, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p} aria-hidden>
      <path d="M8 3V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 8H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Wire shape definitions shared by all panels                               */
/* -------------------------------------------------------------------------- */

type WireAddress = {
  id: string;
  label: string;
  fullAddress: string;
  city: string;
  area: string | null;
  isDefault: boolean;
  createdAt: string;
};

type WireSavedPaymentMethod = {
  id: string;
  type: "BKASH" | "NAGAD" | "ROCKET" | "CARD";
  accountNumber: string;
  isDefault: boolean;
  createdAt: string;
};

type WireFavorite = {
  id: string;
  restaurantId: string;
  createdAt: string;
  restaurant: {
    id: string;
    name: string;
    cuisine: string;
    coverImage: string | null;
    rating: number;
    deliveryTime: number;
    deliveryFee: number;
  };
};

type WireUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  /** Three independent notification toggles. Each one drives its
   *  own row in the Settings → Notifications panel so flipping one
   *  leaves the other two untouched. */
  notifyOrderUpdates: boolean;
  notifyPromotions: boolean;
  notifyNewsletter: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * "Order History" panel.
 *
 *   • Loads `/api/orders` on mount (CUSTOMER scope = own orders).
 *   • Re-fetches on window focus so a freshly delivered order shows
 *     the latest status when the user tabs back to the profile.
 *   • Each row shows restaurant name + id + placed-at + status pill
 *     + items summary + total. The right-hand button routes the user
 *     to `/orders/[id]/track`. For active orders the button says
 *     "Track", for terminal orders (delivered / cancelled) it says
 *     "View" — the tracking page renders both correctly.
 */
export function OrdersPanel() {
  const t = useT();
  // Shared CUSTOMER feed — one poll across the whole app per tab.
  const feed = useOrdersFeed("CUSTOMER");

  // Project the feed snapshot into the local row shape. Lives in a
  // useMemo so the panel doesn't re-render on every feed tick if
  // the projected rows didn't actually change.
  const safeStr = (s: unknown, fallback = ""): string =>
    typeof s === "string" ? s : fallback;
  const safeNum = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;
  const projected = useMemo(() => {
    return feed.orders.map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      return {
        id: safeStr(o.id),
        status:
          (safeStr(o.status, "pending") as OrderStatusApi) ?? "pending",
        placedAt: safeStr(o.placedAt),
        restaurantName: safeStr(o.restaurant?.name, "Restaurant"),
        itemsSummary: items
          .map(
            (i) => `${safeNum(i.qty)}× ${safeStr(i.name, "Item")}`,
          )
          .join(", "),
        total: safeNum(o.total),
      };
    });
  }, [feed.orders]);

  // Window-focus refresh — ask the shared feed to refetch once.
  // (We don't listen to feed changes here; the hook above already
  // does the heavy lifting. This effect is just a manual nudge.)
  useEffect(() => {
    function onFocus() {
      void refreshOrdersFeed("CUSTOMER");
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const orders = projected;
  const loading = feed.loading && projected.length === 0;
  const error = feed.error;

  return (
    <section className="flex w-full min-w-px flex-1 flex-col gap-6">
      <h2 className={SECTION_HEAD}>{t("profile.orders.title")}</h2>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {t("profile.orders.loadFailed")}: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[110px] animate-pulse rounded-card border border-line bg-white"
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-12 text-center">
          <span className="font-display text-[16px] font-extrabold text-ink">
            {t("profile.orders.empty")}
          </span>
          <p className="max-w-xs text-[13px] text-ink-muted">
            {t("profile.orders.emptyHint")}
          </p>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            {t("profile.orders.browseRestaurants")}
          </Link>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-5">
          {orders.map((o) => {
            const placed = o.placedAt ? new Date(o.placedAt) : null;
            const placedLabel = placed
              ? placed.toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";
            const shortId = o.id ? o.id.slice(-6).toUpperCase() : "—";
            return (
              <article
                key={o.id}
                className="flex w-full flex-col gap-4 rounded-card border border-line bg-white p-6"
              >
                <header className="flex w-full items-center justify-between gap-4 whitespace-nowrap">
                  <div className="flex min-w-px flex-col gap-1">
                    <p className="font-display text-[16px] font-bold text-ink">
                      {o.restaurantName}
                    </p>
                    <p className="text-[13px] font-normal text-ink-muted">
                      {placedLabel} · ID: #{shortId}
                    </p>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-md px-3 py-1.5 text-[12px] font-bold whitespace-nowrap " +
                      statusClasses(o.status)
                    }
                  >
                    {t(`orders.status.${o.status}` as "orders.status.pending")}
                  </span>
                </header>

                <div className="h-px w-full bg-line" />

                <div className="flex w-full items-center justify-between gap-4">
                  <div className="flex w-full max-w-[420px] flex-col gap-1 leading-normal">
                    <p className="text-[14px] font-normal text-ink-muted">
                      {o.itemsSummary}
                    </p>
                    <p className="w-full font-display text-[16px] font-extrabold text-brand">
                      {formatTaka(o.total)}
                    </p>
                  </div>
                  <Link
                    href={`/orders/${o.id}/track`}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-brand px-4 py-2.5 text-[13px] font-bold text-brand transition-colors hover:bg-brand hover:text-white"
                  >
                    {isActive(o.status) ? t("profile.orders.track") : t("profile.orders.view")}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Addresses                                                                 */
/* -------------------------------------------------------------------------- */

const LABEL_LABELS: Record<string, string> = {
  HOME: "Home",
  WORK: "Work",
  OTHER: "Other",
};

function friendlyArea(area: string | null, city: string): string {
  return area ? `${area}, ${city}` : city;
}

function AddressRow({
  a,
  busy,
  onEdit,
  onDelete,
}: {
  a: WireAddress;
  busy: boolean;
  onEdit: (a: WireAddress) => void;
  onDelete: (a: WireAddress) => void;
}) {
  const t = useT();
  // Map "HOME"/"WORK"/"OTHER" -> localised label key fragment.
  const labelKey = (() => {
    const v = LABEL_LABELS[a.label];
    if (!v) return null;
    return (
      `profile.addresses.label${v.charAt(0).toUpperCase()}${v.slice(1)}` as Parameters<typeof t>[0]
    );
  })();
  return (
    <article className="flex w-full items-center justify-between gap-4 rounded-card border border-line bg-white p-5">
      <div className="flex min-w-px flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand">
          <MapPinAddressIcon size={18} />
        </span>
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="flex items-center gap-2">
            <span className="font-display text-[14px] font-bold text-ink">
              {labelKey ? t(labelKey) : a.label}
            </span>
            {a.isDefault && (
              <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                {t("profile.addresses.default")}
              </span>
            )}
          </span>
          <span className="text-[13px] text-ink-muted">{a.fullAddress}</span>
          <span className="text-[13px] text-ink-muted">
            {friendlyArea(a.area, a.city)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(a)}
          disabled={busy}
          className="rounded-xl border border-line px-4 py-2 text-[13px] font-bold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          {t("profile.addresses.edit")}
        </button>
        <button
          type="button"
          onClick={() => onDelete(a)}
          disabled={busy}
          className="rounded-xl px-4 py-2 text-[13px] font-bold text-ink-muted transition-colors hover:text-rose-600 disabled:opacity-50"
        >
          {t("profile.addresses.remove")}
        </button>
      </div>
    </article>
  );
}

type AddressFormState = {
  id: string | null;
  label: string;
  fullAddress: string;
  city: string;
  area: string;
  isDefault: boolean;
};

const EMPTY_ADDRESS_FORM: AddressFormState = {
  id: null,
  label: "HOME",
  fullAddress: "",
  city: "",
  area: "",
  isDefault: false,
};

export function AddressesPanel() {
  const t = useT();
  const [addresses, setAddresses] = useState<WireAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddressFormState>(EMPTY_ADDRESS_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ addresses?: WireAddress[] }>("/api/addresses");
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setAddresses(Array.isArray(res.data?.addresses) ? res.data.addresses : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load addresses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_ADDRESS_FORM });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (a: WireAddress) => {
    setForm({
      id: a.id,
      label: a.label,
      fullAddress: a.fullAddress,
      city: a.city,
      area: a.area ?? "",
      isDefault: a.isDefault,
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ ...EMPTY_ADDRESS_FORM });
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.fullAddress.trim()) {
      setFormError(t("profile.addresses.fullAddressRequired"));
      return;
    }
    if (!form.city.trim()) {
      setFormError(t("profile.addresses.cityRequired"));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload = {
      label: form.label,
      fullAddress: form.fullAddress.trim(),
      city: form.city.trim(),
      area: form.area.trim() || undefined,
      isDefault: form.isDefault,
    };
    const path = form.id ? `/api/addresses/${form.id}` : "/api/addresses";
    const method: "POST" | "PATCH" = form.id ? "PATCH" : "POST";
    const res = await apiFetch<unknown>(path, {
      method,
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(res.error.message);
      return;
    }
    closeForm();
    await load();
  };

  const removeAddress = async (a: WireAddress) => {
    if (busyId) return;
    const labelText = LABEL_LABELS[a.label] ? t(`profile.addresses.label${LABEL_LABELS[a.label].charAt(0).toUpperCase()}${LABEL_LABELS[a.label].slice(1)}` as Parameters<typeof t>[0]) : a.label;
    if (typeof window !== "undefined" && !window.confirm(t("profile.addresses.removeConfirm").replace("{label}", labelText))) {
      return;
    }
    setBusyId(a.id);
    const res = await apiFetch<unknown>(`/api/addresses/${a.id}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await load();
  };

  return (
    <section className="flex w-full min-w-px flex-1 flex-col gap-6">
      <h2 className={SECTION_HEAD}>{t("profile.addresses.title")}</h2>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {t("profile.addresses.loadFailed")}: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-card border border-line bg-white" />
          ))}
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-12 text-center">
          <span className="font-display text-[16px] font-extrabold text-ink">
            No addresses added yet
          </span>
          <p className="max-w-sm text-[13px] text-ink-muted">
            Save the places you order to most often so checkout is a single tap.
          </p>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          {addresses.map((a) => (
            <AddressRow
              key={a.id}
              a={a}
              busy={busyId === a.id}
              onEdit={openEdit}
              onDelete={removeAddress}
            />
          ))}
        </div>
      )}

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="flex w-full flex-col gap-4 rounded-card border border-line bg-white p-6"
        >
          <h3 className="font-display text-[16px] font-bold text-ink">
            {form.id ? t("profile.addresses.formTitleEdit") : t("profile.addresses.formTitleCreate")}
          </h3>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {t("profile.addresses.label")}
            </span>
            <select
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="HOME">{t("profile.addresses.labelHome")}</option>
              <option value="WORK">{t("profile.addresses.labelWork")}</option>
              <option value="OTHER">{t("profile.addresses.labelOther")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {t("profile.addresses.fullAddress")}
            </span>
            <input
              type="text"
              value={form.fullAddress}
              onChange={(e) => setForm((f) => ({ ...f, fullAddress: e.target.value }))}
              placeholder="House 42, Road 9/A"
              className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                {t("profile.addresses.area")}
              </span>
              <input
                type="text"
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                placeholder="Dhanmondi"
                className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                {t("profile.addresses.city")}
              </span>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Dhaka - 1209"
                className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            <span className="text-[13px] font-medium text-ink">
              {t("profile.addresses.defaultHelp")}
            </span>
          </label>

          {formError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
            >
              {formError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? t("profile.addresses.saving") : form.id ? t("profile.addresses.saveChanges") : t("profile.addresses.addAddress")}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {t("profile.addresses.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-white py-4 text-[14px] font-bold text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          <PlusIcon />
          {addresses.length === 0 ? t("profile.addresses.addFirst") : t("profile.addresses.addNew")}
        </button>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payment methods                                                           */
/* -------------------------------------------------------------------------- */

const KIND_LABEL: Record<WireSavedPaymentMethod["type"], string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  CARD: "Card",
};

/**
 * Returns `{ logoSrc }` for payment methods that have an official
 * brand mark — bKash, Nagad, and Rocket. The row component
 * renders the brand mark via next/image so the same asset stays
 * crisp on every device. Methods without a logo (CARD) fall back
 * to the generic `iconForKind` glyph.
 */
function logoForKind(kind: WireSavedPaymentMethod["type"]): {
  src: string;
  alt: string;
} | null {
  switch (kind) {
    case "BKASH":
      return { src: "/icons/bkash-logo.png", alt: "bKash" };
    case "NAGAD":
      return { src: "/icons/nagad-logo.png", alt: "Nagad" };
    case "ROCKET":
      return { src: "/icons/rocket-logo.png", alt: "Rocket" };
    default:
      return null;
  }
}

function iconForKind(kind: WireSavedPaymentMethod["type"]) {
  // BKASH / NAGAD / ROCKET all route through `logoForKind` (which
  // returns an <Image>), so this switch only needs to handle the
  // methods without an official brand mark.
  switch (kind) {
    case "CARD":
      return CreditCardIcon;
    default:
      return TicketIcon;
  }
}

function PaymentMethodRow({
  p,
  busy,
  onRemove,
}: {
  p: WireSavedPaymentMethod;
  busy: boolean;
  onRemove: (p: WireSavedPaymentMethod) => void;
}) {
  const Icon = iconForKind(p.type);
  const logo = logoForKind(p.type);
  const t = useT();
  return (
    <article className="flex w-full items-center justify-between gap-4 rounded-card border border-line bg-white p-5">
      <div className="flex min-w-px flex-1 items-center gap-3">
        {logo ? (
          // Brand-mark row — bKash renders via next/image so the
          // official icon stays crisp at any DPR while matching the
          // size of the other payment-method icons in this row.
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
            <Image
              src={logo.src}
              alt={logo.alt}
              fill
              sizes="40px"
              className="object-cover"
            />
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
            <Icon size={20} />
          </span>
        )}
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="flex items-center gap-2">
            <span className="font-display text-[14px] font-bold text-ink">
              {t(`profile.payment.kind.${p.type}` as Parameters<typeof t>[0])}
            </span>
            {p.isDefault && (
              <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                {t("profile.payment.default")}
              </span>
            )}
          </span>
          <span className="text-[13px] text-ink-muted">{p.accountNumber}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(p)}
        disabled={busy}
        className="rounded-xl border border-line px-4 py-2 text-[13px] font-bold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
      >
        {t("profile.payment.remove")}
      </button>
    </article>
  );
}

type PaymentFormState = {
  type: WireSavedPaymentMethod["type"];
  accountNumber: string;
  isDefault: boolean;
};

const EMPTY_PAYMENT_FORM: PaymentFormState = {
  type: "BKASH",
  accountNumber: "",
  isDefault: false,
};

export function PaymentPanel() {
  const t = useT();
  const [methods, setMethods] = useState<WireSavedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PaymentFormState>(EMPTY_PAYMENT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ methods?: WireSavedPaymentMethod[] }>(
        "/api/payment-methods",
      );
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setMethods(Array.isArray(res.data?.methods) ? res.data.methods : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_PAYMENT_FORM });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ ...EMPTY_PAYMENT_FORM });
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.accountNumber.trim()) {
      setFormError(t("profile.payment.accountNumberRequired"));
      return;
    }
    const digits = form.accountNumber.replace(/\D/g, "");
    if (digits.length < 4) {
      setFormError(t("profile.payment.accountNumberMinDigits"));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const res = await apiFetch<unknown>("/api/payment-methods", {
      method: "POST",
      body: JSON.stringify({
        type: form.type,
        accountNumber: form.accountNumber.trim(),
        isDefault: form.isDefault,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFormError(res.error.message);
      return;
    }
    closeForm();
    await load();
  };

  const removeMethod = async (p: WireSavedPaymentMethod) => {
    if (busyId) return;
    const kindText = t(`profile.payment.kind.${p.type}` as Parameters<typeof t>[0]);
    if (typeof window !== "undefined" && !window.confirm(t("profile.payment.removeConfirm").replace("{kind}", kindText))) {
      return;
    }
    setBusyId(p.id);
    const res = await apiFetch<unknown>(`/api/payment-methods/${p.id}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await load();
  };

  return (
    <section className="flex w-full min-w-px flex-1 flex-col gap-6">
      <h2 className={SECTION_HEAD}>{t("profile.payment.title")}</h2>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {t("profile.payment.loadFailed")}: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-card border border-line bg-white" />
          ))}
        </div>
      ) : methods.length === 0 && !showForm ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-12 text-center">
          <span className="font-display text-[16px] font-extrabold text-ink">
            No payment methods yet
          </span>
          <p className="max-w-sm text-[13px] text-ink-muted">
            Save a wallet or card so you can pay in a single tap next time. We
            only store the last 4 digits — the rest stays in your head.
          </p>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          {methods.map((p) => (
            <PaymentMethodRow
              key={p.id}
              p={p}
              busy={busyId === p.id}
              onRemove={removeMethod}
            />
          ))}
        </div>
      )}

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="flex w-full flex-col gap-4 rounded-card border border-line bg-white p-6"
        >
          <h3 className="font-display text-[16px] font-bold text-ink">
            Add a payment method
          </h3>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {t("profile.payment.type")}
            </span>
            <select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as PaymentFormState["type"] }))
              }
              className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="BKASH">{t("profile.payment.kind.BKASH")}</option>
              <option value="NAGAD">{t("profile.payment.kind.NAGAD")}</option>
              <option value="ROCKET">{t("profile.payment.kind.ROCKET")}</option>
              <option value="CARD">{t("profile.payment.cardOption")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {form.type === "CARD" ? t("profile.payment.cardNumber") : t("profile.payment.walletNumber")}
            </span>
            <input
              type="text"
              value={form.accountNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, accountNumber: e.target.value }))
              }
              placeholder={form.type === "CARD" ? "4111 1111 1111 4321" : "+880 1712-345678"}
              className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <span className="text-[11px] text-ink-muted">
              {t("profile.payment.maskHelp")}
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            <span className="text-[13px] font-medium text-ink">
              {t("profile.payment.defaultHelp")}
            </span>
          </label>

          {formError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
            >
              {formError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? t("profile.payment.saving") : t("profile.payment.addPaymentMethod")}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {t("profile.payment.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-white py-4 text-[14px] font-bold text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          <PlusIcon />
          {methods.length === 0 ? t("profile.payment.addFirst") : t("profile.payment.addNew")}
        </button>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Favorites                                                                 */
/* -------------------------------------------------------------------------- */

function favoriteToRestaurantCardProps(f: WireFavorite) {
  return {
    r: {
      id: f.restaurant.id,
      name: f.restaurant.name,
      cuisine: f.restaurant.cuisine,
      image: f.restaurant.coverImage ?? "/assets/rest-1.png",
      rating: f.restaurant.rating,
      reviews: 0,
      timeMin: Math.max(15, Math.round(f.restaurant.deliveryTime * 0.85)),
      timeMax: f.restaurant.deliveryTime,
      deliveryFee: f.restaurant.deliveryFee,
      freeDelivery: f.restaurant.deliveryFee === 0,
      priceBucket: "medium" as const,
    },
  };
}

export function FavoritesPanel() {
  const t = useT();
  const [favorites, setFavorites] = useState<WireFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ favorites?: WireFavorite[] }>(
        "/api/favorites",
      );
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setFavorites(Array.isArray(res.data?.favorites) ? res.data.favorites : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load favorites");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex w-full min-w-px flex-1 flex-col gap-6">
      <h2 className={SECTION_HEAD}>{t("profile.favorites.title")}</h2>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
        >
          {t("profile.favorites.loadFailed")}: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[220px] animate-pulse rounded-2xl border border-line bg-white"
            />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-white p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand">
            <HeartIcon size={20} />
          </span>
          <span className="font-display text-[16px] font-extrabold text-ink">
            {t("profile.favorites.empty")}
          </span>
          <p className="max-w-sm text-[13px] text-ink-muted">
            {t("profile.favorites.emptyHint")}
          </p>
          <Link
            href="/restaurants"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            {t("profile.favorites.browseRestaurants")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((f) => (
            <RestaurantCard
              key={f.id}
              {...favoriteToRestaurantCardProps(f)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Toggle row whose on/off state is **lifted** to the parent so the
 * SettingsPanel can persist the latest value to `/api/users/me`.
 * The toggle is fully controlled — there's no local copy of the
 * flag, so a save error can immediately flip the row back to its
 * previous value.
 */
/**
 * iOS-style switch track.
 *
 *   • Track 48×28 (h-7 w-12) — round pill, brand colour when on,
 *     light grey (bg-line) when off.
 *   • Knob 22×22 (h-[22px] w-[22px]) — true-centred vertically with
 *     `top-1/2 -translate-y-1/2`, slides 22px between off/on so it
 *     sits 3px from each edge of the track at the extremes.
 *   • Smooth `transition-all duration-200` for both colour and
 *     slide, plus a proper `focus-visible` ring so keyboard users
 *     can see the active control.
 */
function ToggleSwitch({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      className={
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 " +
        (on ? "bg-brand" : "bg-line")
      }
    >
      <span
        aria-hidden
        className={
          "absolute top-1/2 left-[3px] h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out " +
          (on ? "translate-x-[22px]" : "translate-x-0")
        }
      />
    </button>
  );
}

function ToggleRow({
  label,
  help,
  on,
  onChange,
}: {
  label: string;
  help: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-card border border-line bg-white p-5">
      <div className="flex flex-col gap-0.5 leading-tight">
        <span className="font-display text-[14px] font-bold text-ink">{label}</span>
        <span className="text-[13px] text-ink-muted">{help}</span>
      </div>
      <ToggleSwitch
        on={on}
        onChange={onChange}
        ariaLabel={`Toggle ${label}`}
      />
    </div>
  );
}

export function SettingsPanel() {
  const { logout, user, setUser } = useAuth();
  const router = useRouter();
  const t = useT();

  const [profile, setProfile] = useState<{
    name: string;
    email: string;
    phone: string;
    notifyOrderUpdates: boolean;
    notifyPromotions: boolean;
    notifyNewsletter: boolean;
  }>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    notifyOrderUpdates: true,
    notifyPromotions: true,
    notifyNewsletter: true,
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // Load the real profile once on mount so the form shows whatever
  // the database currently has (not just the values that came back
  // at login). `useAuth().user` is also kept in sync after PATCH so
  // the navbar pill immediately reflects the new name.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch<{ user?: WireUser }>("/api/users/me");
      if (cancelled) return;
      if (res.ok && res.data?.user) {
        const u = res.data.user;
        setProfile({
          name: u.name,
          email: u.email,
          phone: u.phone ?? "",
          notifyOrderUpdates: u.notifyOrderUpdates,
          notifyPromotions: u.notifyPromotions,
          notifyNewsletter: u.notifyNewsletter,
        });
      }
      setProfileLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Generic optimistic-toggle helper for the three notification
   * flags. We compute the next state, flip the local row first
   * (so the UI feels instant), then PATCH the *single* field to
   * `/api/users/me`. On failure the row snaps back and the error
   * banner shows the server's message. Other fields are never
   * touched — the PATCH payload only carries the one key.
   */
  type NotificationKey =
    | "notifyOrderUpdates"
    | "notifyPromotions"
    | "notifyNewsletter";

  const onNotificationToggle = async (key: NotificationKey, next: boolean) => {
    const prev = profile[key];
    setProfile((p) => ({ ...p, [key]: next }));
    setProfileError(null);
    const res = await apiFetch<{ user?: WireUser }>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ [key]: next }),
    });
    if (!res.ok) {
      setProfile((p) => ({ ...p, [key]: prev }));
      setProfileError(res.error.message);
    }
  };

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (profileSaving) return;
    if (!profile.name.trim()) {
      setProfileError(t("profile.settings.nameRequired"));
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);
    const res = await apiFetch<{ user?: WireUser }>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        name: profile.name.trim(),
        phone: profile.phone.trim(),
      }),
    });
    setProfileSaving(false);
    if (!res.ok) {
      setProfileError(res.error.message);
      return;
    }
    setProfileSuccess(true);
    if (res.data?.user) {
      // Keep the navbar AuthContext in sync so the pill shows the
      // freshly-saved name on the next render.
      setUser({
        id: res.data.user.id,
        name: res.data.user.name,
        email: res.data.user.email,
        phone: res.data.user.phone,
        role: res.data.user.role as "CUSTOMER" | "PARTNER" | "RIDER",
      });
      setProfile((p) => ({
        ...p,
        name: res.data!.user!.name,
        phone: res.data!.user!.phone ?? "",
      }));
    }
  };

  const onSignOut = () => {
    logout();
    router.push("/login");
  };

  return (
    <section className="flex w-full min-w-px flex-1 flex-col gap-6">
      <h2 className={SECTION_HEAD}>{t("profile.settings.title")}</h2>

      <form
        onSubmit={saveProfile}
        className="flex w-full flex-col gap-5"
      >
        <ProfilePictureSection
          userId={user?.id}
          userName={user?.name}
          description={t("profile.profilePicture.defaultDesc")}
        />

        {/* Profile info — defaults are pulled from /api/users/me so the
            form pre-fills with whoever is actually signed in. Email is
            read-only because changing identity would require re-verification. */}
        <div className="flex w-full flex-col gap-4 rounded-card border border-line bg-white p-6">
          <h3 className="font-display text-[16px] font-bold text-ink">
            {t("profile.settings.personalInfo")}
          </h3>

          <label className="flex w-full flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {t("profile.settings.fullName")}
            </span>
            <input
              type="text"
              name="name"
              value={profile.name}
              onChange={(e) => {
                setProfile((p) => ({ ...p, name: e.target.value }));
                setProfileSuccess(false);
              }}
              disabled={profileLoading}
              className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
          </label>

          <label className="flex w-full flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {t("profile.settings.emailAddress")}
            </span>
            <input
              type="email"
              name="email"
              value={profile.email}
              readOnly
              className="h-11 w-full cursor-not-allowed rounded-xl border border-line bg-surface px-4 text-[14px] font-medium text-ink-muted"
            />
            <span className="text-[11px] text-ink-muted">
              {t("profile.settings.emailLocked")}
            </span>
          </label>

          <label className="flex w-full flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
              {t("profile.settings.phoneNumber")}
            </span>
            <input
              type="tel"
              name="phone"
              value={profile.phone}
              onChange={(e) => {
                setProfile((p) => ({ ...p, phone: e.target.value }));
                setProfileSuccess(false);
              }}
              placeholder="+880 1712-345678"
              disabled={profileLoading}
              className="h-11 w-full rounded-xl border border-line bg-surface-page px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
            />
          </label>

          {profileError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
            >
              {profileError}
            </div>
          ) : null}

          {profileSuccess ? (
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#dcfce7] px-3 py-1.5 text-[12px] font-semibold text-[#16a34a]">
              {t("profile.settings.changesSaved")}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={profileSaving || profileLoading}
            className="mt-2 self-start rounded-2xl bg-brand px-5 py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {profileSaving ? t("profile.settings.saving") : t("profile.settings.saveChanges")}
          </button>
        </div>

        {/* Notification preferences — each toggle persists to its
            own column via /api/users/me (notifyOrderUpdates,
            notifyPromotions, notifyNewsletter). Flipping one row
            leaves the other two completely untouched. */}
        <div className="flex w-full flex-col gap-4">
          <h3 className="font-display text-[16px] font-bold text-ink">
            {t("profile.settings.notifications")}
          </h3>
          <ToggleRow
            label={t("profile.settings.orderUpdates")}
            help={t("profile.settings.orderUpdatesHelp")}
            on={profile.notifyOrderUpdates}
            onChange={(next) => onNotificationToggle("notifyOrderUpdates", next)}
          />
          <ToggleRow
            label={t("profile.settings.promos")}
            help={t("profile.settings.promosHelp")}
            on={profile.notifyPromotions}
            onChange={(next) => onNotificationToggle("notifyPromotions", next)}
          />
          <ToggleRow
            label={t("profile.settings.newsletter")}
            help={t("profile.settings.newsletterHelp")}
            on={profile.notifyNewsletter}
            onChange={(next) => onNotificationToggle("notifyNewsletter", next)}
          />
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={onSignOut}
          data-action="logout"
          className="self-start rounded-2xl border border-line bg-white px-5 py-3 text-[14px] font-bold text-ink-muted transition-colors hover:border-rose-300 hover:text-rose-600"
        >
          {t("profile.settings.signOut")}
        </button>
      </form>
    </section>
  );
}
