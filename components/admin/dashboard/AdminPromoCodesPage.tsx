"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { SearchSmallIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";
import {
  CreateAdminPromoCodeModal,
  type CreatedCode,
} from "@/components/admin/dashboard/CreateAdminPromoCodeModal";

/**
 * Orchestrator for /admin/promo-codes.
 *
 *   • Filter by code search, scope (platform / partner), and
 *     active/inactive bucket.
 *   • Toggle `isActive` directly from the row. Each toggle writes
 *     an audit row so the action shows up on /admin/audit-log.
 *   • Create new platform-wide codes via the modal — কাজ ৫.
 */
export function AdminPromoCodesPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminPromoCodesContent />
    </RequireAuth>
  );
}

type AdminPromoCodeRow = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  expiresAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usedCount: number;
  createdByPartner: boolean;
  createdAt: string;
  restaurantId: string | null;
  restaurantName: string | null;
  scope: "platform" | "partner";
  /** কাজ ৫ — optional; the API may attach an image + description.
   *  Older rows returned before কাজ ৫ simply omit these fields. */
  imageUrl?: string | null;
  description?: string | null;
};

const SCOPE_OPTIONS = [
  { value: "", label: "All scopes" },
  { value: "platform", label: "Platform-wide" },
  { value: "partner", label: "Partner-created" },
];

const ACTIVE_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

function AdminPromoCodesContent() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminPromoCodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  // কাজ ৫ — modal state for the "Create promo code" flow.
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, scopeFilter, activeFilter]);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (scopeFilter) params.set("scope", scopeFilter);
      if (activeFilter) params.set("active", activeFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch<{
        codes: AdminPromoCodeRow[];
        total: number;
      }>(`/api/admin/promo-codes?${params.toString()}`);
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setRows(res.data.codes);
      setTotal(res.data.total);
      setLoading(false);
    },
    [debouncedSearch, scopeFilter, activeFilter, page, pageSize],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  const onToggleActive = useCallback(
    async (code: AdminPromoCodeRow) => {
      const next = !code.isActive;
      const verb = next ? "Activate" : "Deactivate";
      const ok = window.confirm(
        `${verb} ${code.code}?\n\n${
          next
            ? "Customers will be able to apply this code again."
            : "Customers will not be able to apply this code at checkout."
        }`,
      );
      if (!ok) return;
      const res = await apiFetch<{
        code: { id: string; isActive: boolean };
      }>(`/api/admin/promo-codes/${code.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        window.alert(`Failed to update code: ${res.error.message}`);
        return;
      }
      setRows((prev) =>
        prev.map((x) =>
          x.id === code.id ? { ...x, isActive: next } : x,
        ),
      );
    },
    [],
  );

  // কাজ ৫ — called from the create modal when the POST succeeds.
  // Prepend the new row + bump the total so the admin sees it
  // immediately, no second fetch needed. The row carries the
  // `scope: "platform"` key (mapped from restaurantId=null) so the
  // existing scope filter keeps rendering it correctly.
  const handleCreated = useCallback((created: CreatedCode) => {
    const newRow: AdminPromoCodeRow = {
      id: created.id,
      code: created.code,
      discountType: created.discountType,
      discountValue: created.discountValue,
      minOrderAmount: created.minOrderAmount,
      maxDiscount: created.maxDiscount,
      expiresAt: created.expiresAt,
      isActive: created.isActive,
      usageLimit: created.usageLimit,
      usedCount: created.usedCount,
      createdByPartner: created.createdByPartner,
      createdAt: created.createdAt,
      restaurantId: created.restaurantId,
      restaurantName: null,
      imageUrl: created.imageUrl,
      scope: "platform",
      description: created.description ?? null,
    };
    setRows((prev) => [newRow, ...prev]);
    setTotal((n) => n + 1);
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  return (
    <AdminShell activeKey="promoCodes">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
        <div className="flex flex-col gap-1 leading-normal">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            Promo codes
          </h1>
          <p className="text-[13px] text-ink-muted">
            {total.toLocaleString()} matching code{total === 1 ? "" : "s"} —
            platform-wide and partner-created, all in one place.
          </p>
        </div>

        {/* কাজ ৫ — opens the create modal. Platform-wide only —
            partner-scoped codes are still authored from the partner
            dashboard. */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          data-action="open-create-admin-promo"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
        >
          <span aria-hidden>+</span>
          Create promo code
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-8">
        <section
          aria-label="Filters"
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 md:flex-row md:items-center md:flex-wrap"
        >
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 md:w-[280px]">
            <SearchSmallIcon size={16} />
            <input
              type="search"
              placeholder="Search by code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
              aria-label="Search promo codes"
            />
          </div>

          <SelectField
            value={scopeFilter}
            onChange={setScopeFilter}
            options={SCOPE_OPTIONS}
            label="Scope"
          />
          <SelectField
            value={activeFilter}
            onChange={setActiveFilter}
            options={ACTIVE_OPTIONS}
            label="Status"
          />

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

        <PromoCodesTable
          rows={rows}
          total={total}
          loading={loading}
          onToggle={onToggleActive}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {/* কাজ ৫ — Create modal. Portaled at z-1100 so it covers
          sidebars + nav. Lives at the orchestrator root so the
          "Create promo code" header button can stay focused on
          open/close. */}
      <CreateAdminPromoCodeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
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
/*  Promo codes table                                                          */
/* -------------------------------------------------------------------------- */

function PromoCodesTable({
  rows,
  total,
  loading,
  onToggle,
}: {
  rows: AdminPromoCodeRow[];
  total: number;
  loading: boolean;
  onToggle: (code: AdminPromoCodeRow) => void;
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
          {total === 0 ? "No promo codes match your filters" : "Nothing on this page"}
        </span>
        <p className="max-w-xs text-[13px] text-ink-muted">
          Promo codes are created from the partner dashboard or from a future
          admin create-form (out of scope here).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-2">
      <div className="hidden gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[160px_120px_1.6fr_120px_120px_140px]">
        <span>Code</span>
        <span>Discount</span>
        <span>Scope · Restaurant</span>
        <span>Used / Limit</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.map((c) => (
          <li
            key={c.id}
            className="grid grid-cols-1 gap-y-2 rounded-xl border border-line bg-white p-3 transition-colors hover:bg-surface md:grid-cols-[160px_120px_1.6fr_120px_120px_140px] md:items-center md:gap-3"
          >
            <span className="font-display text-[14px] font-extrabold text-brand">
              {c.code}
            </span>

            <span className="text-[13px] font-semibold text-ink">
              {c.discountType === "PERCENTAGE"
                ? `${c.discountValue}%`
                : `৳${c.discountValue.toLocaleString()}`}
            </span>

            <div className="flex flex-col leading-tight">
              <span className="text-[12px] font-semibold text-ink">
                {c.scope === "platform" ? "Platform-wide" : "Partner"}
              </span>
              <span className="text-[11px] text-ink-muted truncate">
                {c.restaurantName ?? "—"}
              </span>
            </div>

            <span className="text-[12px] text-ink-muted">
              {c.usedCount.toLocaleString()}
              {c.usageLimit ? ` / ${c.usageLimit.toLocaleString()}` : " / ∞"}
            </span>

            <span>
              {c.isActive ? (
                <span className="inline-flex items-center rounded-[20px] bg-[#dcfce7] px-2 py-1 text-[11px] font-semibold text-[#16a34a]">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-[20px] bg-[#fef2f2] px-2 py-1 text-[11px] font-semibold text-rose-500">
                  Inactive
                </span>
              )}
            </span>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onToggle(c)}
                className={
                  "inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold transition-colors " +
                  (c.isActive
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")
                }
              >
                {c.isActive ? "Deactivate" : "Activate"}
              </button>
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
