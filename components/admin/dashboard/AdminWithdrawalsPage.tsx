"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { apiFetch } from "@/lib/apiClient";

type Role = "ALL" | "CUSTOMER" | "PARTNER" | "RIDER";
type Status = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

type WireItem = {
  id: string;
  source: "WITHDRAWAL_REQUEST" | "PAYOUT";
  role: "CUSTOMER" | "PARTNER" | "RIDER";
  amount: number;
  payoutMethod: string;
  payoutDestination: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  user: { id: string; name: string; email: string };
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
};

type Counts = {
  customer: { pending: number; approved: number; rejected: number };
  partner: { pending: number; approved: number; rejected: number };
  rider: { pending: number; approved: number; rejected: number };
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<WireItem["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
  FAILED: "bg-rose-50 text-rose-700",
};

export function AdminWithdrawalsPage() {
  const [role, setRole] = useState<Role>("ALL");
  const [status, setStatus] = useState<Status>("PENDING");
  const [items, setItems] = useState<WireItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reject modal.
  const [rejectTarget, setRejectTarget] = useState<WireItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (role !== "ALL") params.set("role", role);
    if (status !== "ALL") params.set("status", status);
    params.set("pageSize", "100");
    const res = await apiFetch<{ items: WireItem[]; counts: Counts }>(
      `/api/admin/withdrawals?${params.toString()}`,
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setError(null);
    setItems(res.data?.items ?? []);
    setCounts(res.data?.counts ?? null);
  }, [role, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = useCallback(
    async (id: string) => {
      setActionBusy(id);
      const res = await apiFetch(`/api/admin/withdrawals`, {
        method: "PATCH",
        body: JSON.stringify({ id, decision: "APPROVE" }),
      });
      setActionBusy(null);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await load();
    },
    [load],
  );

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    setActionBusy(rejectTarget.id);
    const res = await apiFetch(`/api/admin/withdrawals`, {
      method: "PATCH",
      body: JSON.stringify({
        id: rejectTarget.id,
        decision: "REJECT",
        rejectionReason: rejectReason.trim(),
      }),
    });
    setActionBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setRejectTarget(null);
    setRejectReason("");
    await load();
  }, [load, rejectReason, rejectTarget]);

  const totalPending = useMemo(() => {
    if (!counts) return 0;
    return (
      counts.customer.pending +
      counts.partner.pending +
      counts.rider.pending
    );
  }, [counts]);

  return (
    <RequireAuth role="ADMIN">
      <AdminShell activeKey="withdrawals">
        {/* Bug 2 — outer wrapper uses the same `p-8` envelope as the
            Dashboard page (no more `max-w-page` / `mx-auto` so the
            content reflows identically to the rest of the admin
            portal). */}
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-[24px] font-extrabold text-ink md:text-[28px]">
                Withdrawals
              </h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                Review customer wallet withdrawals and partner / rider
                payout requests in one place.
                {totalPending > 0 ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                    {totalPending} pending
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <FilterGroup
              label="Role"
              value={role}
              options={[
                { value: "ALL", label: "All" },
                { value: "CUSTOMER", label: "Customer" },
                { value: "PARTNER", label: "Partner" },
                { value: "RIDER", label: "Rider" },
              ]}
              onChange={setRole}
            />
            <FilterGroup
              label="Status"
              value={status}
              options={[
                { value: "PENDING", label: "Pending" },
                { value: "APPROVED", label: "Approved" },
                { value: "REJECTED", label: "Rejected" },
                { value: "ALL", label: "All" },
              ]}
              onChange={setStatus}
            />
            {counts ? (
              <div className="hidden text-[12px] text-ink-muted sm:block sm:ml-auto">
                Customer pending: {counts.customer.pending} · Partner/Rider
                pending: {counts.partner.pending}
              </div>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
            >
              {error}
            </div>
          ) : null}

          {/* Table — on mobile the table is wider than the
              viewport (8 columns), so wrap it in an overflow-x-auto
              container so the user can swipe horizontally to see
              hidden columns instead of fighting the page width. */}
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="min-w-[640px] text-left sm:min-w-full">
              <thead>
                <tr className="bg-surface-page text-[12px] uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payout</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-ink-muted">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-ink-muted">
                      No matching requests.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={`${it.source}-${it.id}`} className="text-[13px]">
                      <td className="px-4 py-3 text-ink-muted">
                        {fmtDate(it.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          {it.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{it.user.name}</p>
                        <p className="text-[12px] text-ink-muted">
                          {it.user.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        ৳{it.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {it.payoutMethod}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {it.payoutDestination}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                            (STATUS_TONE[it.status] ??
                              "bg-ink-muted/10 text-ink-muted")
                          }
                        >
                          {it.status}
                        </span>
                        {it.rejectionReason ? (
                          <p className="mt-1 text-[11px] text-rose-700">
                            {it.rejectionReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {it.status === "PENDING" || it.status === "PROCESSING" ? (
                          <div className="inline-flex gap-2">
                            {it.source === "WITHDRAWAL_REQUEST" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(it.id)}
                                  disabled={actionBusy === it.id}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectTarget(it);
                                    setRejectReason("");
                                  }}
                                  className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-[12px] text-ink-muted">
                                Manage in Payouts
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12px] text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reject modal */}
        {rejectTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="font-display text-lg font-extrabold text-ink">
                Reject withdrawal
              </h3>
              <p className="mt-1 text-[13px] text-ink-muted">
                Reject ৳{rejectTarget.amount.toLocaleString()} withdrawal for{" "}
                {rejectTarget.user.name}? The amount will be returned to
                their wallet.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Reason (visible to the customer)"
                className="mt-4 w-full rounded-lg border border-line p-3 text-[13px]"
              />
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRejectConfirm}
                  disabled={actionBusy === rejectTarget.id || rejectReason.trim().length < 3}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {actionBusy === rejectTarget.id ? "Rejecting…" : "Reject"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </AdminShell>
    </RequireAuth>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[12px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-line bg-white sm:flex-initial">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              "shrink-0 px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:text-[12px] " +
              (opt.value === value
                ? "bg-brand text-white"
                : "text-ink-muted hover:bg-surface-page")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}