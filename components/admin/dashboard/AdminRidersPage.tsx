"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { apiFetch } from "@/lib/apiClient";
import { formatTaka } from "@/components/restaurants/cart/CartProvider";
import { formatHoursMinutes } from "@/lib/rider-hours-format";

/**
 * /admin/riders — overview table + per-row drill-down.
 *
 *   • Top of page: filter (All / Online / Offline), search by
 *     name. Auto-refreshes every 15 seconds so the status column
 *     tracks the rider-presence heuristic (`isEffectivelyOnline`).
 *   • Each row shows name, phone, vehicle, zone address (text),
 *     status badge, last seen, today hours, lifetime deliveries +
 *     earnings.
 *   • Row click opens the detail panel:
 *       – 30-day per-day online hours (table, Asia/Dhaka days)
 *       – Recent 10 deliveries
 *       – Zone map preview (Leaflet, with a circle overlay)
 *       – "Change zone" button (admin picker, audit-logged)
 *
 *   The page reads `/api/admin/riders` (table) + per-rider
 *   `/api/admin/riders/[id]` (detail). Both require admin auth.
 */

type RiderRow = {
  riderProfileId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  vehicle: string;
  zone:
    | { lat: number; lng: number; radiusKm: number; address: string }
    | null;
  status: "online" | "offline";
  lastSeen: string | null;
  onlineSecondsToday: number;
  totalDeliveries: number;
  totalEarning: number;
};

export function AdminRidersPage() {
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (search.trim()) params.set("q", search.trim());
    const res = await apiFetch<{ riders: RiderRow[] }>(
      `/api/admin/riders?${params.toString()}`,
    );
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setError(null);
    setRiders(res.data?.riders ?? []);
    setLoading(false);
  }, [filter, search]);

  // Initial + on-filter-changed fetch, plus a 15s heartbeat so the
  // online badge tracks `isEffectivelyOnline` (i.e. a rider who
  // closed their tab stops being "online" within ~2 minutes
  // without needing a manual refresh).
  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const counts = useMemo(() => {
    const online = riders.filter((r) => r.status === "online").length;
    return {
      all: riders.length,
      online,
      offline: riders.length - online,
    };
  }, [riders]);

  return (
    <RequireAuth role="ADMIN">
      <AdminShell activeKey="riders">
        {/* Bug 2 — outer container uses the same `p-8` wrapper as
            the admin Dashboard so every page reads as one design
            system. Previously this page omitted the padding and
            headers hugged the sidebar. */}
        <div className="flex flex-1 flex-col gap-6 p-8">
          <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-[24px] font-extrabold text-ink md:text-[28px]">
                Riders
              </h1>
              <p className="text-[13px] text-ink-muted">
                Live overview of every registered rider. Rows refresh every 15
                seconds. Click a row for online hours and recent deliveries.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-ink-muted">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#16a34a]" />
                {counts.online} online
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-ink-muted" />
                {counts.offline} offline
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 font-semibold text-ink">
                {counts.all} total
              </span>
            </div>
          </header>

          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="inline-flex items-center rounded-full bg-surface p-1 text-[12px] font-semibold">
                {(["all", "online", "offline"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={filter === key}
                    className={
                      "rounded-full px-4 py-1.5 transition-colors " +
                      (filter === key
                        ? "bg-white text-ink shadow-sm"
                        : "text-ink-muted hover:text-ink")
                    }
                  >
                    {key === "all"
                      ? "All"
                      : key === "online"
                        ? "Online"
                        : "Offline"}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-white px-4 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 md:w-72"
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
              >
                {error}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wide text-ink-muted">
                    <tr className="border-b border-line">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Vehicle</th>
                      <th className="px-4 py-3 font-semibold">Zone</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Last seen</th>
                      <th className="px-4 py-3 font-semibold">Today</th>
                      <th className="px-4 py-3 font-semibold">Total deliveries</th>
                      <th className="px-4 py-3 font-semibold">Earnings</th>
                    </tr>
                  </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-6 text-center text-ink-muted"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : riders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-6 text-center text-ink-muted"
                      >
                        No riders match the current filter.
                      </td>
                    </tr>
                  ) : (
                    riders.map((r) => (
                      <tr
                        key={r.userId}
                        onClick={() => setSelectedId(r.userId)}
                        className="cursor-pointer border-t border-line hover:bg-surface"
                      >
                        <td className="py-3 pr-3 font-semibold text-ink">
                          {r.name}
                        </td>
                        <td className="py-3 pr-3 text-ink-muted">
                          {r.phone ?? "—"}
                        </td>
                        <td className="py-3 pr-3 text-ink-muted">
                          {r.vehicle || "—"}
                        </td>
                        <td className="py-3 pr-3 text-ink-muted">
                          {r.zone ? r.zone.address || "(empty address)" : "—"}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                              (r.status === "online"
                                ? "bg-green-100 text-green-700"
                                : "bg-ink-muted/10 text-ink-muted")
                            }
                          >
                            <span
                              className={
                                "inline-block h-1.5 w-1.5 rounded-full " +
                                (r.status === "online"
                                  ? "bg-green-600"
                                  : "bg-ink-muted")
                              }
                            />
                            {r.status === "online" ? "Online" : "Offline"}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-ink-muted">
                          {r.lastSeen ? formatDateTime(r.lastSeen) : "—"}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-ink">
                          {formatHoursMinutes(r.onlineSecondsToday)}
                        </td>
                        <td className="py-3 pr-3 text-ink-muted">
                          {r.totalDeliveries}
                        </td>
                        <td className="py-3 pr-3 text-ink">
                          {formatTaka(r.totalEarning)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {selectedId ? (
          <RiderDetailDrawer
            riderId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </AdminShell>
    </RequireAuth>
  );
}

/* -------------------------------------------------------------------------- */
/*  Detail drawer                                                             */
/* -------------------------------------------------------------------------- */

function RiderDetailDrawer({
  riderId,
  onClose,
}: {
  riderId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DetailRider | null>(null);
  const [hours, setHours] = useState<Array<{ date: string; seconds: number }>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingZone, setEditingZone] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      apiFetch<{ rider: DetailRider }>(`/api/admin/riders/${riderId}`),
      apiFetch<{ hoursPerDay: Array<{ date: string; seconds: number }> }>(
        `/api/admin/riders/${riderId}/hours?days=30`,
      ),
    ]);
    if (!a.ok) {
      setError(a.error.message);
    } else if (a.data) {
      setDetail(a.data.rider);
    } else {
      setError("Empty response");
    }
    if (!b.ok) {
      setError((prev) => prev ?? b.error.message);
    } else if (b.data) {
      setHours(b.data.hoursPerDay);
    }
    setLoading(false);
  }, [riderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex justify-end bg-black/55"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl md:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            Rider detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-semibold text-ink-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        {loading ? (
          <p className="p-6 text-ink-muted">Loading…</p>
        ) : error ? (
          <p
            role="alert"
            className="m-6 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
          >
            {error}
          </p>
        ) : detail ? (
          <div className="flex flex-col gap-6 p-6">
            <section>
              <h3 className="font-display text-[16px] font-bold text-ink">
                {detail.name}
              </h3>
              <p className="text-[12px] text-ink-muted">
                {detail.email} · {detail.phone ?? "—"} · {detail.vehicle || "—"}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[12px]">
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold " +
                    (detail.status === "online"
                      ? "bg-green-100 text-green-700"
                      : "bg-ink-muted/10 text-ink-muted")
                  }
                >
                  <span
                    className={
                      "inline-block h-1.5 w-1.5 rounded-full " +
                      (detail.status === "online"
                        ? "bg-green-600"
                        : "bg-ink-muted")
                    }
                  />
                  {detail.status === "online" ? "Online" : "Offline"}
                </span>
                <span className="text-ink-muted">
                  last seen:{" "}
                  {detail.lastSeen ? formatDateTime(detail.lastSeen) : "—"}
                </span>
              </div>
            </section>

            <section className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                  Service zone
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingZone((v) => !v)}
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  {editingZone ? "Close" : "Change zone"}
                </button>
              </div>
              {editingZone ? (
                <AdminZoneEditor
                  riderUserId={detail.userId}
                  initial={detail.zone ?? undefined}
                  onSaved={() => {
                    setEditingZone(false);
                    void reload();
                  }}
                />
              ) : detail.zone ? (
                <>
                  <p className="mt-2 text-[13px] text-ink">
                    {detail.zone.address || "(no address)"}{" "}
                    <span className="text-ink-muted">
                      · {detail.zone.radiusKm} km
                    </span>
                  </p>
                  <ZonePreview
                    lat={detail.zone.lat}
                    lng={detail.zone.lng}
                    radiusKm={detail.zone.radiusKm}
                    address={detail.zone.address}
                  />
                </>
              ) : (
                <p className="mt-2 text-[13px] text-ink-muted">
                  No zone selected. The rider must set one before going online.
                </p>
              )}
            </section>

            <section>
              <h4 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Today
              </h4>
              <p className="mt-2 font-display text-[16px] font-extrabold text-ink">
                {formatHoursMinutes(detail.onlineSecondsToday)}
              </p>
            </section>

            <section>
              <h4 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Online hours — last 30 days
              </h4>
              <div className="mt-2 overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-[12px]">
                  <thead className="text-ink-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">Date</th>
                      <th className="px-3 py-1.5 font-semibold">Hours online</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hours.map((d) => (
                      <tr key={d.date} className="border-t border-line">
                        <td className="px-3 py-1.5 text-ink">{d.date}</td>
                        <td className="px-3 py-1.5 font-semibold text-ink">
                          {formatHoursMinutes(d.seconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">
                Recent deliveries
              </h4>
              <ul className="mt-2 flex flex-col gap-2">
                {detail.recentDeliveries.length === 0 ? (
                  <li className="text-[13px] text-ink-muted">
                    No deliveries yet.
                  </li>
                ) : (
                  detail.recentDeliveries.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[12px]"
                    >
                      <span className="font-semibold text-ink">
                        {d.restaurant}
                      </span>
                      <span className="text-ink-muted">
                        {formatDateTime(d.placedAt)}
                      </span>
                      <span className="font-semibold text-ink">
                        {formatTaka(d.riderEarning ?? 0)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="rounded-xl bg-surface px-4 py-3 text-[12px] text-ink-muted">
              Lifetime deliveries:{" "}
              <span className="font-bold text-ink">
                {detail.lifetimeDeliveries}
              </span>{" "}
              · Total earnings:{" "}
              <span className="font-bold text-ink">
                {formatTaka(detail.lifetimeEarning)}
              </span>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type DetailRider = {
  riderProfileId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  vehicle: string;
  zone: {
    lat: number;
    lng: number;
    radiusKm: number;
    address: string;
  } | null;
  status: "online" | "offline";
  lastSeen: string | null;
  onlineSecondsToday: number;
  lifetimeDeliveries: number;
  lifetimeEarning: number;
  recentDeliveries: Array<{
    id: string;
    restaurant: string;
    status: string;
    total: number;
    deliveryFee: number;
    riderEarning: number | null;
    placedAt: string;
  }>;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/*  Read-only zone preview                                                    */
/* -------------------------------------------------------------------------- */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const ZonePreviewMap = dynamic(
  () =>
    import("@/components/rider/dashboard/ZonePreviewMap").then(
      (m) => m.ZonePreviewMap,
    ),
  { ssr: false, loading: () => null },
) as unknown as ComponentType<{
  lat: number;
  lng: number;
  radiusKm: number;
  address: string;
}>;

// Bug 2 — `RiderZonePicker` transitively imports `leaflet` at module
// level (Leaflet touches `window` at import time). Loading it
// statically would crash the entire /admin/riders page during
// SSR with "window is not defined". Dynamic-import with
// `ssr: false` so the placeholder renders server-side and the
// real picker hydrates client-side once the admin opens the
// "Change zone" modal.
const RiderZonePicker = dynamic(
  () =>
    import("@/components/rider/dashboard/RiderZonePicker").then(
      (m) => m.RiderZonePicker,
    ),
  { ssr: false, loading: () => null },
) as unknown as ComponentType<{
  initial?: { lat: number; lng: number; address?: string; radiusKm?: number };
  onCancel?: () => void;
  onSaved?: (z: {
    lat: number;
    lng: number;
    address: string;
    radiusKm: number;
  }) => void;
  title?: string;
  description?: string;
  requireForSubmit?: boolean;
  mode?: "dashboard" | "register";
}>;

function ZonePreview({
  lat,
  lng,
  radiusKm,
  address,
}: {
  lat: number;
  lng: number;
  radiusKm: number;
  address: string;
}) {
  return (
    <div className="mt-3 h-56 w-full overflow-hidden rounded-xl border border-line">
      <ZonePreviewMap
        lat={lat}
        lng={lng}
        radiusKm={radiusKm}
        address={address}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Admin "Change zone" editor — uses the existing map picker, audit-logged.  */
/* -------------------------------------------------------------------------- */

function AdminZoneEditor({
  riderUserId,
  initial,
  onSaved,
}: {
  riderUserId: string;
  initial?: { lat: number; lng: number; radiusKm?: number; address?: string };
  onSaved: () => void;
}) {
  // The admin uses the same `RiderZonePicker` shell but posts to
  // `/api/admin/riders/[id]` so the audit log records the admin
  // as the actor (not the rider). The picker itself only knows
  // about /api/riders/zone, so we wrap it and only call it as a
  // "local picker" — the actual save is the explicit Save
  // button below which POSTs to the admin route.
  const [pendingZone, setPendingZone] = useState<{
    lat: number;
    lng: number;
    address: string;
    radiusKm: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!pendingZone || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{
      zone: { lat: number; lng: number; address: string; radiusKm: number };
    }>(`/api/admin/riders/${riderUserId}`, {
      method: "PATCH",
      body: JSON.stringify(pendingZone),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line p-3">
      <RiderZonePicker
        initial={initial}
        title="Update service zone"
        description="Click the map or drag the pin to pick a new centre. Save writes to the rider's profile and is audit-logged."
        requireForSubmit={false}
        onSaved={(z) => {
          setPendingZone({
            lat: z.lat,
            lng: z.lng,
            address: z.address,
            radiusKm: z.radiusKm ?? 5,
          });
        }}
      />
      <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-end">
        <button
          type="button"
          onClick={onSaved}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!pendingZone || submitting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Confirm new zone"}
        </button>
      </div>
      {error ? (
        <p className="text-[12px] font-semibold text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
