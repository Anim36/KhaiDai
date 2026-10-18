"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { SearchSmallIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";

/**
 * Orchestrator for /admin/audit-log.
 *
 * Read-only viewer over the AuditLog table. Filters:
 *   • entityType (free-text exact match)
 *   • action (free-text exact match)
 *   • from / to (date range)
 *   • q (free-text — action / entityType / entityId / actor name/email)
 *
 * Click a row to expand its oldValue / newValue JSON inline — that
 * way the page stays a single table without a separate detail
 * route for what's essentially a flat event log.
 */
export function AdminAuditLogPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminAuditLogContent />
    </RequireAuth>
  );
}

type AdminAuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
};

function AdminAuditLogContent() {
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [entityType, action, debouncedSearch, from, to]);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (entityType) params.set("entityType", entityType);
      if (action) params.set("action", action);
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch<{
        entries: AdminAuditEntry[];
        total: number;
      }>(`/api/admin/audit-log?${params.toString()}`);
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setEntries(res.data.entries);
      setTotal(res.data.total);
      setLoading(false);
    },
    [entityType, action, debouncedSearch, from, to, page, pageSize],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  return (
    <AdminShell activeKey="auditLog">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
        <div className="flex flex-col gap-1 leading-normal">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            Audit log
          </h1>
          <p className="text-[13px] text-ink-muted">
            {total.toLocaleString()} matching event
            {total === 1 ? "" : "s"} — read-only history of every
            sensitive platform change.
          </p>
        </div>
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
              placeholder="Search action / entity / actor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
              aria-label="Search audit log"
            />
          </div>

          <TextField label="Entity" value={entityType} onChange={setEntityType} placeholder="e.g. Order, User…" />
          <TextField label="Action" value={action} onChange={setAction} placeholder="e.g. ORDER_STATUS_CHANGED…" />
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />

          <div className="md:ml-auto text-[12px] text-ink-muted">
            {loading ? "Loading…" : `${entries.length} of ${total}`}
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

        <AuditTable
          entries={entries}
          total={total}
          loading={loading}
          openId={openId}
          onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
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
/*  Filter inputs                                                              */
/* -------------------------------------------------------------------------- */

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-[180px] rounded-xl border border-line bg-white px-2 text-[13px] font-semibold text-ink outline-none focus:border-brand placeholder:font-normal placeholder:text-ink-muted"
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-muted">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border border-line bg-white px-2 text-[13px] font-semibold text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Audit table                                                                */
/* -------------------------------------------------------------------------- */

function AuditTable({
  entries,
  total,
  loading,
  openId,
  onToggle,
}: {
  entries: AdminAuditEntry[];
  total: number;
  loading: boolean;
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  if (loading && entries.length === 0) {
    return (
      <div className="h-[300px] animate-pulse rounded-2xl border border-line bg-white" />
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-white p-12 text-center">
        <span className="font-display text-[16px] font-extrabold text-ink">
          {total === 0 ? "No audit events match your filters" : "Nothing on this page"}
        </span>
        <p className="max-w-xs text-[13px] text-ink-muted">
          Audit rows are written by sensitive mutations (order
          status changes, promo create/delete, suspend actions).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-2">
      <div className="hidden gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[1.4fr_1fr_1fr_140px_120px]">
        <span>Action</span>
        <span>Entity</span>
        <span>Actor</span>
        <span>When</span>
        <span className="text-right">Detail</span>
      </div>

      <ul className="flex flex-col gap-1">
        {entries.map((e) => {
          const open = openId === e.id;
          return (
            <li
              key={e.id}
              className="rounded-xl border border-line bg-white"
            >
              <button
                type="button"
                onClick={() => onToggle(e.id)}
                aria-expanded={open}
                className="grid w-full grid-cols-1 gap-y-2 rounded-xl p-3 text-left transition-colors hover:bg-surface md:grid-cols-[1.4fr_1fr_1fr_140px_120px] md:items-center md:gap-3"
              >
                <span className="font-display text-[12px] font-extrabold text-ink">
                  {e.action}
                </span>
                <span className="text-[12px] text-ink-muted truncate">
                  {e.entityType} ·{" "}
                  <span className="font-mono">{e.entityId.slice(0, 10)}…</span>
                </span>
                <span className="text-[12px] text-ink-muted truncate">
                  {e.actor ? `${e.actor.name} (${e.actor.role})` : "System"}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
                <span className="text-right text-[12px] font-semibold text-brand">
                  {open ? "Hide" : "View"}
                </span>
              </button>

              {open ? (
                <div className="grid grid-cols-1 gap-3 border-t border-line p-3 md:grid-cols-2">
                  <JsonBlock label="Before" value={e.oldValue} />
                  <JsonBlock label="After" value={e.newValue} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = useMemo(() => {
    if (value === null || value === undefined) return "—";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <pre className="overflow-x-auto rounded-xl border border-line bg-surface px-3 py-2 text-[11px] text-ink font-mono leading-snug">
        {text}
      </pre>
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
