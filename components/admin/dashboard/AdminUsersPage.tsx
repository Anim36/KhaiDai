"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { SearchSmallIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";

/**
 * Orchestrator for /admin/users.
 *
 * Single page owns: filter state (role / search / suspended /
 * page), data state (rows + total), detail modal state, and the
 * suspend/unsuspend mutation. Mutations trigger an audit row +
 * optimistic UI update so the table reflects the new flag without
 * a full re-fetch.
 *
 * RequireAuth(role="ADMIN") redirects anyone without an ADMIN
 * session to /admin/login.
 */
export function AdminUsersPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminUsersContent />
    </RequireAuth>
  );
}

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isSuspended: boolean;
  createdAt: string;
  joinedLabel: string;
};

type AdminUserDetail = AdminUserRow & {
  orderCount: number;
  restaurantCount: number;
};

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "PARTNER", label: "Partner" },
  { value: "RIDER", label: "Rider" },
  { value: "ADMIN", label: "Admin" },
];

const SUSPENDED_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "false", label: "Active" },
  { value: "true", label: "Suspended" },
];

function AdminUsersContent() {
  const [roleFilter, setRoleFilter] = useState("");
  const [suspendedFilter, setSuspendedFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail modal
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce the search input so we don't spam the API on every
  // keystroke. 300ms matches typical search-as-you-type UX.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever any filter changes so the user always
  // sees the top of the result set after a filter change.
  useEffect(() => {
    setPage(1);
  }, [roleFilter, suspendedFilter, debouncedSearch]);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (roleFilter) params.set("role", roleFilter);
      if (suspendedFilter) params.set("suspended", suspendedFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch<{
        users: AdminUserRow[];
        total: number;
      }>(`/api/admin/users?${params.toString()}`);
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setRows(res.data.users);
      setTotal(res.data.total);
      setLoading(false);
    },
    [roleFilter, suspendedFilter, debouncedSearch, page, pageSize],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  /* ---------------------------------------------------------------- */
  /*  Detail modal                                                     */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    apiFetch<{ user: AdminUserDetail }>(`/api/admin/users/${openId}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error.message);
          setDetailLoading(false);
          return;
        }
        setDetail(res.data.user);
        setDetailLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load user");
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  /* ---------------------------------------------------------------- */
  /*  Suspend toggle                                                   */
  /* ---------------------------------------------------------------- */
  const onToggleSuspend = useCallback(
    async (user: AdminUserRow) => {
      const next = !user.isSuspended;
      const verb = next ? "Suspend" : "Reinstate";
      const ok = window.confirm(
        `${verb} ${user.name} (${user.email})?\n\n${
          next
            ? "They will be blocked from signing in until reinstated."
            : "Their account will be reactivated."
        }`,
      );
      if (!ok) return;
      const res = await apiFetch<{ user: { id: string; isSuspended: boolean } }>(
        `/api/admin/users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isSuspended: next }),
        },
      );
      if (!res.ok) {
        window.alert(`Failed to update user: ${res.error.message}`);
        return;
      }
      // Optimistic in-place update so the table reflects the new
      // state immediately. We also refresh the detail modal (if
      // the toggled row is currently open) so its flag stays in
      // sync.
      setRows((prev) =>
        prev.map((r) =>
          r.id === user.id ? { ...r, isSuspended: next } : r,
        ),
      );
      if (detail && detail.id === user.id) {
        setDetail({ ...detail, isSuspended: next });
      }
    },
    [detail],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  return (
    <AdminShell activeKey="users">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
        <div className="flex flex-col gap-1 leading-normal">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            Users
          </h1>
          <p className="text-[13px] text-ink-muted">
            {total.toLocaleString()} matching user
            {total === 1 ? "" : "s"} — search by name, email, or phone.
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-8">
        {/* Filter bar */}
        <section
          aria-label="Filters"
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 md:flex-row md:items-center"
        >
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 md:w-[360px]">
            <SearchSmallIcon size={16} />
            <input
              type="search"
              placeholder="Search name / email / phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
              aria-label="Search users"
            />
          </div>

          <SelectField
            value={roleFilter}
            onChange={setRoleFilter}
            options={ROLE_OPTIONS}
            label="Role"
          />
          <SelectField
            value={suspendedFilter}
            onChange={setSuspendedFilter}
            options={SUSPENDED_OPTIONS}
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

        <UsersTable
          rows={rows}
          total={total}
          loading={loading}
          onOpen={setOpenId}
          onToggleSuspend={onToggleSuspend}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {openId ? (
        <UserDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setOpenId(null)}
          onToggleSuspend={
            detail
              ? () =>
                  onToggleSuspend({
                    id: detail.id,
                    name: detail.name,
                    email: detail.email,
                    phone: detail.phone,
                    role: detail.role,
                    isSuspended: detail.isSuspended,
                    createdAt: detail.createdAt,
                    joinedLabel: detail.joinedLabel,
                  })
              : undefined
          }
        />
      ) : null}
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
/*  Users table                                                                */
/* -------------------------------------------------------------------------- */

const ROLE_TONE: Record<string, { bg: string; text: string }> = {
  CUSTOMER: { bg: "bg-[#dbeafe]", text: "text-[#3b82f6]" },
  PARTNER: { bg: "bg-[#fef3c7]", text: "text-[#a16207]" },
  RIDER: { bg: "bg-[#fce7f3]", text: "text-[#be185d]" },
  ADMIN: { bg: "bg-[#ffebe8]", text: "text-brand" },
};

function UsersTable({
  rows,
  total,
  loading,
  onOpen,
  onToggleSuspend,
}: {
  rows: AdminUserRow[];
  total: number;
  loading: boolean;
  onOpen: (id: string) => void;
  onToggleSuspend: (user: AdminUserRow) => void;
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
          {total === 0 ? "No users match your filters" : "Nothing on this page"}
        </span>
        <p className="max-w-xs text-[13px] text-ink-muted">
          Try removing a filter or clearing your search.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-2">
      {/* Column headers — desktop only */}
      <div className="hidden gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_90px_100px_100px_110px] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_120px_120px_120px_120px]">
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span>Joined</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.map((u) => {
          const tone = ROLE_TONE[u.role] ?? ROLE_TONE.CUSTOMER;
          return (
            <li
              key={u.id}
              className="grid grid-cols-1 gap-y-2 rounded-xl border border-line bg-white p-3 transition-colors hover:bg-surface md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_90px_100px_100px_110px] md:items-center md:gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_120px_120px_120px_120px] lg:gap-3"
            >
              <button
                type="button"
                onClick={() => onOpen(u.id)}
                className="flex items-center gap-2 text-left"
                aria-label={`Open ${u.name}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[20px] bg-[#ffebe8] text-[12px] font-bold text-brand">
                  {initialsOf(u.name)}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[13px] font-bold text-ink truncate">
                    {u.name}
                  </span>
                  {u.phone ? (
                    <span className="text-[11px] text-ink-muted truncate">
                      {u.phone}
                    </span>
                  ) : null}
                </span>
              </button>

              <span className="text-[13px] text-ink-muted truncate">
                {u.email}
              </span>

              <span
                className={
                  "inline-flex w-fit items-center rounded-[20px] px-2 py-1 text-[11px] font-semibold " +
                  tone.bg +
                  " " +
                  tone.text
                }
              >
                {u.role}
              </span>

              <span className="text-[12px] text-ink-muted">
                {u.joinedLabel}
              </span>

              <span>
                {u.isSuspended ? (
                  <span className="inline-flex items-center rounded-[20px] bg-[#fef2f2] px-2 py-1 text-[11px] font-semibold text-rose-500">
                    Suspended
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-[20px] bg-[#dcfce7] px-2 py-1 text-[11px] font-semibold text-[#16a34a]">
                    Active
                  </span>
                )}
              </span>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(u.id)}
                  className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSuspend(u)}
                  className={
                    "inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold transition-colors " +
                    (u.isSuspended
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100")
                  }
                >
                  {u.isSuspended ? "Reinstate" : "Suspend"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Detail modal                                                               */
/* -------------------------------------------------------------------------- */

function UserDetailModal({
  detail,
  loading,
  onClose,
  onToggleSuspend,
}: {
  detail: AdminUserDetail | null;
  loading: boolean;
  onClose: () => void;
  onToggleSuspend?: () => void;
}) {
  // Esc closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="User detail"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-[20px] font-extrabold text-ink">
            User detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
          >
            ×
          </button>
        </header>

        {loading || !detail ? (
          <div className="h-[200px] animate-pulse rounded-xl border border-line bg-white" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#ffebe8] text-[16px] font-bold text-brand">
                {initialsOf(detail.name)}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="font-display text-[18px] font-extrabold text-ink">
                  {detail.name}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {detail.email}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-white p-4 text-[13px]">
              <Field label="Role" value={detail.role} />
              <Field label="Status" value={detail.isSuspended ? "Suspended" : "Active"} />
              <Field label="Phone" value={detail.phone ?? "—"} />
              <Field label="Joined" value={detail.joinedLabel} />
              <Field label="Orders placed" value={detail.orderCount.toLocaleString()} />
              <Field
                label="Restaurants owned"
                value={detail.restaurantCount.toLocaleString()}
              />
              <Field label="User ID" value={detail.id} fullWidth mono />
            </dl>

            {onToggleSuspend ? (
              <button
                type="button"
                onClick={() => {
                  onToggleSuspend();
                  // The parent flips `detail.isSuspended` optimistically,
                  // so closing on next tick keeps the modal coherent.
                  setTimeout(onClose, 50);
                }}
                className={
                  "inline-flex h-10 w-full items-center justify-center rounded-xl text-[13px] font-semibold transition-colors " +
                  (detail.isSuspended
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-rose-600 text-white hover:bg-rose-700")
                }
              >
                {detail.isSuspended ? "Reinstate account" : "Suspend account"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  fullWidth,
  mono,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : undefined}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd
        className={
          "mt-0.5 text-[13px] font-semibold text-ink break-all " +
          (mono ? "font-mono text-[12px]" : "")
        }
      >
        {value}
      </dd>
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

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function initialsOf(name: string | null | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || "U").toUpperCase();
}
