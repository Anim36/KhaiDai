"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { apiFetch } from "@/lib/apiClient";

/**
 * /admin/verifications — admin queue for partner + rider approvals.
 *
 *   • Two tabs: "Restaurants" and "Riders", both default to the
 *     PENDING filter so the admin sees what's still actionable.
 *   • Status filter dropdown (PENDING / APPROVED / REJECTED) so
 *     rejected items can be re-surfaced after a partner / rider
 *     resubmits.
 *   • Click a row → detail panel with registration info +
 *     uploaded documents inline (image preview, PDF as a link).
 *   • "Approve" / "Reject" buttons (Reject requires a reason).
 *   • Approve / Reject writes an AuditLog + pushes a notification
 *     to the partner / rider (handled server-side).
 */
export function AdminVerificationsPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminShell activeKey="verifications">
        <PageHeader />
        <VerificationsContent />
      </AdminShell>
    </RequireAuth>
  );
}

/**
 * Page-level header. We don't reuse AdminDashboardHeader because
 * that one is wired to the overview's `loadedAt` + `refreshing`
 * state, neither of which the verifications page has.
 */
function PageHeader() {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-white px-8 py-5">
      <h1 className="font-display text-[22px] font-extrabold leading-none text-ink">
        Verifications
      </h1>
      <p className="text-[13px] font-normal text-ink-muted">
        Review restaurant + rider applications.
      </p>
    </header>
  );
}

type QueueType = "restaurant" | "rider";
type QueueStatus = "PENDING" | "APPROVED" | "REJECTED";

type DocRow = {
  id: string;
  documentType: string;
  fileUrl: string;
  uploadedAt: string;
};

type RestaurantRow = {
  id: string;
  name: string;
  cuisine: string;
  address: string;
  createdAt: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  owner: { id: string; name: string; email: string; phone: string | null };
  documents: DocRow[];
};

type RiderRow = {
  id: string;
  userId: string;
  vehicleType: string | null;
  vehicleRegNumber: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  user: { id: string; name: string; email: string; phone: string | null };
  documents: DocRow[];
};

function VerificationsContent() {
  const [tab, setTab] = useState<QueueType>("restaurant");
  const [status, setStatus] = useState<QueueStatus>("PENDING");
  const [rows, setRows] = useState<(RestaurantRow | RiderRow)[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<{
      restaurants?: RestaurantRow[];
      riders?: RiderRow[];
    }>(
      `/api/admin/verifications?type=${tab}&status=${status}`,
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const list = res.data?.restaurants ?? res.data?.riders ?? [];
    setRows(list);
    if (list.length > 0 && !list.some((r) => r.id === selectedId)) {
      setSelectedId(list[0]!.id);
    }
    if (list.length === 0) setSelectedId(null);
  }, [tab, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload();
  }, [reload]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const onAction = useCallback(
    async (action: "APPROVE" | "REJECT", reason: string | null) => {
      if (!selected) return;
      const res = await apiFetch<unknown>(
        `/api/admin/verifications/${tab}/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            rejectionReason: reason ?? undefined,
          }),
        },
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setActionMsg(
        action === "APPROVE"
          ? "Approved. The partner / rider has been notified."
          : "Rejected. The partner / rider has been notified.",
      );
      window.setTimeout(() => setActionMsg(null), 4000);
      reload();
    },
    [selected, tab, reload],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
      {/* Tabs + status filter. Wrap to two rows on small viewports
          so the three tab buttons + dropdown don't fight for the
          same row. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              setTab("restaurant");
              setSelectedId(null);
            }}
            aria-pressed={tab === "restaurant"}
            className={
              "h-10 rounded-xl px-4 text-[13px] font-semibold transition-colors " +
              (tab === "restaurant"
                ? "bg-brand text-white"
                : "border border-line bg-white text-ink-muted hover:text-ink")
            }
          >
            Restaurants
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("rider");
              setSelectedId(null);
            }}
            aria-pressed={tab === "rider"}
            className={
              "h-10 rounded-xl px-4 text-[13px] font-semibold transition-colors " +
              (tab === "rider"
                ? "bg-brand text-white"
                : "border border-line bg-white text-ink-muted hover:text-ink")
            }
          >
            Riders
          </button>
        </div>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value.toUpperCase() as QueueStatus)
          }
          aria-label="Filter by status"
          className="h-10 shrink-0 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink sm:ml-auto"
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
        >
          {error}
        </div>
      ) : null}
      {actionMsg ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700"
        >
          {actionMsg}
        </div>
      ) : null}

      {/* Two-pane: list (left) + detail (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <QueueList
          rows={rows}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          tab={tab}
        />
        {selected ? (
          <DetailPanel
            row={selected}
            tab={tab}
            status={status}
            onAction={onAction}
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-line bg-white text-[13px] text-ink-muted">
            {loading
              ? "Loading…"
              : `No ${status.toLowerCase()} ${tab === "restaurant" ? "restaurants" : "riders"} in the queue.`}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueList({
  rows,
  loading,
  selectedId,
  onSelect,
  tab,
}: {
  rows: (RestaurantRow | RiderRow)[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tab: QueueType;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 text-[13px] text-ink-muted">
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 text-[13px] text-ink-muted">
        No applications match this filter.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-2">
      {rows.map((r) => {
        const active = r.id === selectedId;
        const title =
          tab === "restaurant"
            ? (r as RestaurantRow).name
            : (r as RiderRow).user.name;
        const subtitle =
          tab === "restaurant"
            ? `${(r as RestaurantRow).cuisine} · ${(r as RestaurantRow).address}`
            : `${(r as RiderRow).user.email}`;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={
                "flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left transition-colors " +
                (active
                  ? "bg-brand-50 font-semibold text-ink"
                  : "text-ink hover:bg-surface")
              }
            >
              <span className="text-[14px] font-semibold">{title}</span>
              <span className="text-[12px] font-normal text-ink-muted">
                {subtitle}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DetailPanel({
  row,
  tab,
  status,
  onAction,
}: {
  row: RestaurantRow | RiderRow;
  tab: QueueType;
  status: QueueStatus;
  onAction: (action: "APPROVE" | "REJECT", reason: string | null) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submitApprove = async () => {
    setBusy(true);
    await onAction("APPROVE", null);
    setBusy(false);
  };
  const submitReject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await onAction("REJECT", reason.trim());
    setBusy(false);
    setReason("");
    setRejectOpen(false);
  };

  // Detail content varies by type.
  const isRestaurant = tab === "restaurant";
  const r = row as RestaurantRow;
  const rider = row as RiderRow;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-extrabold text-ink">
            {isRestaurant ? r.name : rider.user.name}
          </h2>
          <p className="text-[13px] font-normal text-ink-muted">
            {isRestaurant
              ? `${r.cuisine} · ${r.address}`
              : `${rider.user.email}${rider.user.phone ? " · " + rider.user.phone : ""}`}
          </p>
        </div>
        <span
          className={
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase " +
            (status === "PENDING"
              ? "bg-amber-100 text-amber-700"
              : status === "APPROVED"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700")
          }
        >
          {status}
        </span>
      </header>

      {isRestaurant ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Owner" value={r.owner.name} />
          <Detail label="Owner email" value={r.owner.email} />
          <Detail label="Owner phone" value={r.owner.phone ?? "—"} />
          <Detail label="Cuisine" value={r.cuisine} />
          <Detail label="Address" value={r.address} />
          <Detail label="Submitted" value={new Date(r.createdAt).toLocaleString()} />
        </dl>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="Rider" value={rider.user.name} />
          <Detail label="Email" value={rider.user.email} />
          <Detail label="Phone" value={rider.user.phone ?? "—"} />
          <Detail label="Vehicle" value={rider.vehicleType ?? "—"} />
          <Detail label="Vehicle reg" value={rider.vehicleRegNumber ?? "—"} />
          <Detail label="Submitted" value={new Date(rider.submittedAt).toLocaleString()} />
        </dl>
      )}

      {row.rejectionReason ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <span className="font-semibold">Rejection reason:</span>{" "}
          {row.rejectionReason}
        </div>
      ) : null}

      <DocumentsList docs={row.documents} />

      {status === "PENDING" ? (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={submitApprove}
            data-action="approve"
            className="inline-flex h-10 items-center rounded-xl bg-emerald-600 px-4 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Approve
          </button>
          {!rejectOpen ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
              data-action="open-reject"
              className="inline-flex h-10 items-center rounded-xl border border-rose-300 bg-white px-4 text-[13px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              Reject
            </button>
          ) : (
            <div className="flex w-full flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason (visible to the partner / rider)…"
                className="w-full rounded-lg border border-rose-300 bg-white p-2 text-[13px]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectOpen(false);
                    setReason("");
                  }}
                  className="h-9 rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-ink-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={submitReject}
                  data-action="confirm-reject"
                  className="h-9 rounded-lg bg-rose-600 px-3 text-[12px] font-bold text-white disabled:opacity-60"
                >
                  Confirm reject
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * Inline preview of every uploaded document. Images render as
 * `<img>` for visual review; PDFs render as a link to open in a
 * new tab. Admins reviewing both at the same time is the common
 * flow, so we lay them out as a simple grid.
 */
function DocumentsList({ docs }: { docs: DocRow[] }) {
  if (docs.length === 0) {
    return (
      <p className="text-[13px] italic text-ink-muted">
        No documents were uploaded.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
        Documents ({docs.length})
      </h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {docs.map((d) => {
          const isPdf = d.fileUrl.startsWith("data:application/pdf");
          const isImage = d.fileUrl.startsWith("data:image/");
          return (
            <li
              key={d.id}
              className="overflow-hidden rounded-xl border border-line bg-white"
            >
              <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-2 text-[11px] font-bold uppercase text-ink-muted">
                <span>{prettyDocType(d.documentType)}</span>
                <span className="font-normal normal-case text-ink-muted">
                  {new Date(d.uploadedAt).toLocaleString()}
                </span>
              </div>
              <div className="p-3">
                {isImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={d.fileUrl}
                    alt={d.documentType}
                    className="max-h-64 w-full object-contain"
                  />
                ) : isPdf ? (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-brand underline"
                  >
                    Open PDF in new tab
                  </a>
                ) : (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-brand underline"
                  >
                    Open document
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function prettyDocType(t: string): string {
  return t
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}