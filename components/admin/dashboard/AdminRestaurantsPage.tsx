"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { SearchSmallIcon, StarIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";

/**
 * Orchestrator for /admin/restaurants.
 *
 * Single page owns: search + status filter, data state, and the
 * suspend/unsuspend mutation. Mutations trigger an audit row +
 * optimistic UI update so the table reflects the new flag
 * immediately.
 *
 * Soft-deleted restaurants stay hidden by default — admins can
 * surface them with the "Show deleted" toggle if they're
 * investigating old orders.
 */
export function AdminRestaurantsPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminRestaurantsContent />
    </RequireAuth>
  );
}

type AdminRestaurantRow = {
  id: string;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  ownerName: string;
  ownerEmail: string;
  isSuspended: boolean;
  /**
   * Bug 3 — partner "Accepting Orders" toggle. Surfaced in the
   * admin status column alongside the platform-level
   * Suspended / Active flag.
   */
  isAcceptingOrders: boolean;
  deletedAt: string | null;
  totalOrders: number;
  createdAt: string;
};

const SUSPENDED_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "false", label: "Active" },
  { value: "true", label: "Suspended" },
];

function AdminRestaurantsContent() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suspendedFilter, setSuspendedFilter] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminRestaurantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, suspendedFilter, includeDeleted]);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (suspendedFilter) params.set("suspended", suspendedFilter);
      if (includeDeleted) params.set("includeDeleted", "1");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch<{
        restaurants: AdminRestaurantRow[];
        total: number;
      }>(`/api/admin/restaurants?${params.toString()}`);
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setRows(res.data.restaurants);
      setTotal(res.data.total);
      setLoading(false);
    },
    [debouncedSearch, suspendedFilter, includeDeleted, page, pageSize],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  const onToggleSuspend = useCallback(
    async (r: AdminRestaurantRow) => {
      const next = !r.isSuspended;
      const verb = next ? "Suspend" : "Reinstate";
      const ok = window.confirm(
        `${verb} "${r.name}"?\n\n${
          next
            ? "It will be hidden from customer-facing listings until reinstated."
            : "It will appear in customer-facing listings again."
        }`,
      );
      if (!ok) return;
      const res = await apiFetch<{
        restaurant: { id: string; isSuspended: boolean };
      }>(`/api/admin/restaurants/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isSuspended: next }),
      });
      if (!res.ok) {
        window.alert(`Failed to update restaurant: ${res.error.message}`);
        return;
      }
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id ? { ...x, isSuspended: next } : x,
        ),
      );
    },
    [],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  return (
    <AdminShell activeKey="restaurants">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
        <div className="flex flex-col gap-1 leading-normal">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            Restaurants
          </h1>
          <p className="text-[13px] text-ink-muted">
            {total.toLocaleString()} matching restaurant
            {total === 1 ? "" : "s"} — platform-wide catalog.
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-8">
        <section
          aria-label="Filters"
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 md:flex-row md:items-center"
        >
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 md:w-[360px]">
            <SearchSmallIcon size={16} />
            <input
              type="search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
              aria-label="Search restaurants"
            />
          </div>

          <SelectField
            value={suspendedFilter}
            onChange={setSuspendedFilter}
            options={SUSPENDED_OPTIONS}
            label="Status"
          />

          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Show deleted
          </label>

          <div className="md:ml-auto text-[12px] text-ink-muted">
            {loading ? "Loading…" : `${rows.length} of ${total}`}
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
          >
            {error}
          </div>
        ) : null}

        <RestaurantsTable
          rows={rows}
          total={total}
          loading={loading}
          onToggleSuspend={onToggleSuspend}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </AdminShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Select field                                                               */
/* -------------------------------------------------------------------------- */

function SelectField({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border border-line bg-white px-2 text-[13px] font-semibold text-ink outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Restaurants table                                                          */
/* -------------------------------------------------------------------------- */

function RestaurantsTable({
  rows,
  total,
  loading,
  onToggleSuspend,
}: {
  rows: AdminRestaurantRow[];
  total: number;
  loading: boolean;
  onToggleSuspend: (r: AdminRestaurantRow) => void;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="h-[300px] animate-pulse rounded-2xl border border-line bg-white" />
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
        <span className="font-display text-[16px] font-extrabold text-ink">
          {total === 0
            ? "No restaurants match your filters"
            : "Nothing on this page"}
        </span>
        <p className="max-w-xs text-[13px] text-ink-muted">
          Try clearing your search or toggling "Show deleted".
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-white p-2">
      {/* Bug 1 — column widths use `minmax(0, ...)` so the long-text
          columns (address / owner email) can shrink instead of
          pushing the table wider than the viewport. Each row also
          carries `min-w-0` on its text containers so the
          `truncate` class actually has room to ellipsize. */}
      <div className="hidden gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_120px_120px_120px_140px]">
        <span>Name · Cuisine</span>
        <span>Owner</span>
        <span>Rating</span>
        <span>Orders</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-1 gap-y-2 rounded-xl border border-line bg-white p-3 transition-colors hover:bg-surface md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_120px_120px_120px_140px] md:items-center md:gap-3"
          >
            <div className="flex min-w-0 flex-col leading-tight">
              <span
                className="text-[14px] font-bold text-ink truncate"
                title={r.name}
              >
                {r.name}
              </span>
              <span
                className="text-[12px] text-ink-muted truncate"
                title={`${r.cuisine} · ${r.address}`}
              >
                {r.cuisine} · {r.address}
              </span>
            </div>

            <div className="flex min-w-0 flex-col leading-tight">
              <span
                className="text-[13px] font-semibold text-ink truncate"
                title={r.ownerName}
              >
                {r.ownerName}
              </span>
              <span
                className="text-[11px] text-ink-muted truncate"
                title={r.ownerEmail}
              >
                {r.ownerEmail}
              </span>
            </div>

            <span className="inline-flex items-center gap-1 rounded-md bg-surface-rating px-2 py-1 text-[12px] font-semibold text-ink w-fit">
              <StarIcon size={12} />
              {r.rating.toFixed(1)}
            </span>

            <span className="text-[12px] text-ink-muted">
              {r.totalOrders.toLocaleString()}
            </span>

            <span className="flex flex-col items-start gap-1">
              {r.deletedAt ? (
                <span className="inline-flex items-center rounded-[20px] bg-[#f9fafb] px-2 py-1 text-[11px] font-semibold text-ink-muted">
                  Deleted
                </span>
              ) : r.isSuspended ? (
                <span className="inline-flex items-center rounded-[20px] bg-[#fef2f2] px-2 py-1 text-[11px] font-semibold text-rose-500">
                  Suspended
                </span>
              ) : (
                <span className="inline-flex items-center rounded-[20px] bg-[#dcfce7] px-2 py-1 text-[11px] font-semibold text-[#16a34a]">
                  Active
                </span>
              )}
              {/* Bug 3 — partner "Accepting Orders" status. Stacked
                  below the platform-level pill so the admin can see
                  at a glance whether the restaurant is offline by
                  partner choice (cleaning, stock-out) versus offline
                  by platform action (suspended). */}
              {!r.deletedAt && !r.isSuspended ? (
                r.isAcceptingOrders ? (
                  <span className="inline-flex items-center gap-1 rounded-[20px] bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    />
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-[20px] bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    />
                    Offline
                  </span>
                )
              ) : null}
            </span>

            <div className="flex items-center justify-end gap-2">
              {r.deletedAt ? (
                <span className="text-[11px] text-ink-muted">—</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleSuspend(r)}
                  className={
                    "inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold transition-colors " +
                    (r.isSuspended
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100")
                  }
                >
                  {r.isSuspended ? "Reinstate" : "Suspend"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pagination                                                                 */
/* -------------------------------------------------------------------------- */

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-end gap-2 text-[12px] font-semibold text-ink-muted"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 disabled:opacity-50 hover:border-brand hover:text-brand"
      >
        Prev
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 disabled:opacity-50 hover:border-brand hover:text-brand"
      >
        Next
      </button>
    </nav>
  );
}
