"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Orchestrator for /admin/profile-requests.
 *
 *   • Status filter (PENDING / APPROVED / REJECTED).
 *   • Master list (left): rider + type + note + submitted-at.
 *   • Detail (right): Approve / Reject actions.
 *
 * Auth: ADMIN only.
 */

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
// কাজ ২ — partner requests ride the same queue. The detail
// renderer uses `requester` (rider fields nested below) for RIDER
// rows and `restaurant` for PARTNER rows.
type RequestRole = "RIDER" | "PARTNER";
type RequestType =
  | "PROFILE_INFO"
  | "VEHICLE_INFO"
  | "RESTAURANT_PROFILE"
  | "RESTAURANT_LOCATION";

type RequestRow = {
  id: string;
  role: RequestRole;
  requestType: RequestType;
  status: RequestStatus;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  adminNote: string | null;
  requester: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    vehicleType: string | null;
    vehicleRegNumber: string | null;
  };
  restaurant: { id: string; name: string; cuisine: string } | null;
};

/**
 * Human label for each request type. Used in both the master list
 * chips and the detail panel header.
 */
const TYPE_LABEL: Record<RequestType, string> = {
  PROFILE_INFO: "adminProfileRequests.typeProfile",
  VEHICLE_INFO: "adminProfileRequests.typeVehicle",
  RESTAURANT_PROFILE: "adminProfileRequests.typeRestaurantProfile",
  RESTAURANT_LOCATION: "adminProfileRequests.typeRestaurantLocation",
};

function AdminProfileRequestsInner() {
  const t = useT();
  const [status, setStatus] = useState<RequestStatus>("PENDING");
  // কাজ ২ — optional role filter. "ALL" passes no extra where
  // clause so the admin sees both rider + partner requests.
  const [roleFilter, setRoleFilter] = useState<"ALL" | RequestRole>("ALL");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Reject prompt state
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ status });
    if (roleFilter !== "ALL") qs.set("role", roleFilter);
    const res = await apiFetch<{ requests: RequestRow[]; total: number }>(
      `/api/admin/profile-change-requests?${qs.toString()}`,
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    const list = res.data?.requests ?? [];
    setRows(list);
    setSelectedId((cur) => {
      if (list.length === 0) return null;
      if (cur && list.some((r) => r.id === cur)) return cur;
      return list[0]!.id;
    });
  }, [status, roleFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const handleApprove = useCallback(async () => {
    if (!selected) return;
    setActionMsg(null);
    const res = await apiFetch<unknown>(
      `/api/admin/profile-change-requests/${selected.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "APPROVE" }),
      },
    );
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setActionMsg(t("adminProfileRequests.approveDone"));
    window.setTimeout(() => setActionMsg(null), 4000);
    void reload();
  }, [selected, reload, t]);

  const openRejectPrompt = useCallback(() => {
    if (!selected) return;
    setRejectTargetId(selected.id);
    setRejectNote("");
  }, [selected]);

  const closeRejectPrompt = useCallback(() => {
    setRejectTargetId(null);
    setRejectNote("");
  }, []);

  const submitReject = useCallback(async () => {
    if (!rejectTargetId) return;
    if (!rejectNote.trim()) return;
    setRejectBusy(true);
    setActionMsg(null);
    const res = await apiFetch<unknown>(
      `/api/admin/profile-change-requests/${rejectTargetId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "REJECT",
          adminNote: rejectNote.trim(),
        }),
      },
    );
    setRejectBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setActionMsg(t("adminProfileRequests.rejectDone"));
    window.setTimeout(() => setActionMsg(null), 4000);
    closeRejectPrompt();
    void reload();
  }, [rejectTargetId, rejectNote, reload, closeRejectPrompt, t]);

  return (
    <AdminShell activeKey="profileRequests">
      <header className="flex flex-col gap-2 border-b border-line bg-white px-8 py-5 w-full md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            {t("adminProfileRequests.pageTitle")}
          </h1>
          <p className="text-[13px] text-ink-muted">
            {t("adminProfileRequests.pageSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("adminProfileRequests.statusFilter")}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RequestStatus)}
            className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <label className="ml-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("adminProfileRequests.roleFilter")}
          </label>
          <select
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(e.target.value as "ALL" | RequestRole)
            }
            className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] font-medium text-ink"
          >
            <option value="ALL">{t("adminProfileRequests.roleAll")}</option>
            <option value="RIDER">{t("adminProfileRequests.roleRider")}</option>
            <option value="PARTNER">
              {t("adminProfileRequests.rolePartner")}
            </option>
          </select>
        </div>
      </header>

      {actionMsg ? (
        <div className="mx-8 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
          {actionMsg}
        </div>
      ) : null}
      {error ? (
        <div className="mx-8 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
          {t("adminProfileRequests.loadFailed")}: {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 px-8 py-6 md:grid-cols-[1.2fr_1.8fr]">
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-display text-[14px] font-bold text-ink">
              {loading
                ? "Loading…"
                : `${rows.length} request${rows.length === 1 ? "" : "s"}`}
            </h2>
          </header>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
              {t("adminProfileRequests.empty")}
            </p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-current={r.id === selectedId ? "true" : undefined}
                    data-row-id={r.id}
                    data-status={r.status}
                    data-request-type={r.requestType}
                    className={
                      "flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface " +
                      (r.id === selectedId ? "bg-[#fff5f3]" : "bg-white")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[13px] font-bold text-ink">
                        {r.role === "PARTNER" && r.restaurant
                          ? r.restaurant.name
                          : r.requester.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="inline-flex h-5 items-center justify-center rounded-full bg-surface px-2 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                          {r.role === "RIDER"
                            ? t("adminProfileRequests.roleRider")
                            : t("adminProfileRequests.rolePartner")}
                        </span>
                        <span
                          data-row-type={r.requestType}
                          className="inline-flex h-5 items-center justify-center rounded-full bg-[#fff5f3] px-2 text-[10px] font-bold uppercase tracking-wide text-brand"
                        >
                          {t(TYPE_LABEL[r.requestType] as Parameters<typeof t>[0])}
                        </span>
                      </div>
                    </div>
                    <p className="text-[12px] text-ink-muted">
                      {r.role === "PARTNER" && r.restaurant
                        ? `${r.restaurant.cuisine} · ${r.requester.email}`
                        : r.requester.email}
                    </p>
                    <p className="line-clamp-1 text-[12px] text-ink-muted">
                      {r.note ?? "—"}
                    </p>
                    <span className="text-[10px] text-ink-muted">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
          {selected ? (
            <>
              <header className="flex flex-col gap-1">
                <h3 className="font-display text-[18px] font-extrabold text-ink">
                  {selected.role === "PARTNER" && selected.restaurant
                    ? selected.restaurant.name
                    : selected.requester.name}
                </h3>
                <p className="text-[13px] text-ink-muted">
                  {selected.role === "PARTNER"
                    ? selected.requester.email
                    : `${selected.requester.email} · ${selected.requester.phone ?? "(no phone)"}`}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {t("adminProfileRequests.submittedAt")}{" "}
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </header>
              <div className="rounded-xl bg-surface px-4 py-3">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t("adminProfileRequests.type")}
                </span>
                <span className="text-[14px] font-semibold text-ink">
                  {t(TYPE_LABEL[selected.requestType] as Parameters<typeof t>[0])}
                </span>
              </div>
              {selected.role === "PARTNER" && selected.restaurant ? (
                <div className="rounded-xl bg-surface px-4 py-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t("adminProfileRequests.restaurantLabel")}
                  </span>
                  <span className="text-[14px] font-semibold text-ink">
                    {selected.restaurant.name} · {selected.restaurant.cuisine}
                  </span>
                </div>
              ) : null}
              {selected.note ? (
                <div className="rounded-xl bg-surface px-4 py-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t("adminProfileRequests.note")}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-ink">
                    {selected.note}
                  </p>
                </div>
              ) : null}
              {selected.status === "REJECTED" && selected.adminNote ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                    Admin rejection note
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-rose-700">
                    {selected.adminNote}
                  </p>
                </div>
              ) : null}
              {selected.status === "PENDING" ? (
                <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                  <button
                    type="button"
                    onClick={openRejectPrompt}
                    data-action="reject-profile-request"
                    className="h-11 rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    {t("adminProfileRequests.reject")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprove()}
                    data-action="approve-profile-request"
                    className="h-11 rounded-xl bg-brand px-5 text-[13px] font-bold text-white hover:brightness-105"
                  >
                    {t("adminProfileRequests.approve")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-ink-muted">
                  Status: <strong>{selected.status}</strong>
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">
              Select a request on the left to review.
            </p>
          )}
        </div>
      </div>

      {rejectTargetId ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 px-3 py-6 sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !rejectBusy) closeRejectPrompt();
          }}
        >
          <div className="flex w-full max-w-md flex-col gap-4 rounded-card border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-[18px] font-extrabold text-ink">
              {t("adminProfileRequests.rejectPromptTitle")}
            </h2>
            <p className="text-[12px] text-ink-muted">
              {t("adminProfileRequests.rejectPromptHint")}
            </p>
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">
                {t("adminProfileRequests.adminNote")}
              </span>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder={t("adminProfileRequests.adminNotePlaceholder")}
                className="w-full rounded-xl border border-line bg-surface-page px-4 py-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
              <button
                type="button"
                onClick={closeRejectPrompt}
                disabled={rejectBusy}
                className="h-11 rounded-xl border border-line bg-white px-5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60"
              >
                {t("adminProfileRequests.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void submitReject()}
                disabled={rejectBusy || !rejectNote.trim()}
                data-action="submit-reject"
                className="h-11 rounded-xl bg-rose-600 px-5 text-[13px] font-bold text-white hover:brightness-105 disabled:opacity-60"
              >
                {t("adminProfileRequests.reject")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

export function AdminProfileRequestsPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminProfileRequestsInner />
    </RequireAuth>
  );
}