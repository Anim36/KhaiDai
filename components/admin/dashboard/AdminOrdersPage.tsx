"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { SearchSmallIcon } from "@/components/icons";
import { apiFetch } from "@/lib/apiClient";

/**
 * Orchestrator for /admin/orders.
 *
 *   • Status, date-range, and free-text search filters.
 *   • Click row → opens the detail modal which fetches the full
 *     order (items, all three actors) from `/api/admin/orders/[id]`.
 *
 * RequireAuth(role="ADMIN") redirects anyone without an ADMIN
 * session to /admin/login.
 */
export function AdminOrdersPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminOrdersContent />
    </RequireAuth>
  );
}

type AdminOrderRow = {
  id: string;
  shortId: string;
  status: string;
  statusLabel: string;
  total: number;
  customerName: string;
  restaurantName: string;
  riderName: string | null;
  placedAt: string;
  /** ধাপ ৪ — payment gateway fields, surfaced in the list + detail. */
  paymentMethod: "CASH" | "BKASH" | "NAGAD" | "CARD";
  paymentGatewayStatus:
    | "NOT_INITIATED"
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "CANCELLED";
  gatewayTransactionId: string | null;
};

type AdminOrderDetail = AdminOrderRow & {
  subtotal: number;
  deliveryFee: number;
  tax: number;
  discountAmount: number;
  promoCode: string | null;
  paymentMethod: string;
  deliveryAddress: string;
  customer: { id: string; name: string; email: string; phone: string | null };
  restaurant: { id: string; name: string; address: string; cuisine: string };
  rider: { id: string; name: string; phone: string | null } | null;
  items: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    price: number;
    lineTotal: number;
  }>;
};

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "offered_to_rider", label: "Looking for rider" },
  { value: "picked_up", label: "Picked up" },
  { value: "on_the_way", label: "On the way" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

/** ধাপ ৪ — human wording for the SSLCommerz gateway state. */
function gatewayStatusLabel(
  s: AdminOrderRow["paymentGatewayStatus"],
): string {
  switch (s) {
    case "PAID":
      return "Paid (confirmed)";
    case "PENDING":
      return "Awaiting payment";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled by customer";
    case "NOT_INITIATED":
      return "Not started";
  }
}

/** ধাপ ৪ — PaymentMethod enum → the label a customer picked. Rocket
 *  is folded into CARD on the server side (there is no ROCKET enum),
 *  so we label it "Card / Rocket" rather than lying about it. */
const PAYMENT_METHOD_LABEL: Record<
  AdminOrderRow["paymentMethod"],
  string
> = {
  CASH: "Cash on delivery",
  BKASH: "bKash",
  NAGAD: "Nagad",
  CARD: "Card / Rocket",
};

const STATUS_TONE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-[#ffebe8]", text: "text-brand" },
  preparing: { bg: "bg-[#dbeafe]", text: "text-[#3b82f6]" },
  ready: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
  offered_to_rider: { bg: "bg-[#fef3c7]", text: "text-[#a16207]" },
  picked_up: { bg: "bg-[#f9fafb]", text: "text-ink-muted" },
  on_the_way: { bg: "bg-[#f9fafb]", text: "text-ink-muted" },
  delivered: { bg: "bg-[#dcfce7]", text: "text-[#16a34a]" },
  cancelled: { bg: "bg-[#fef2f2]", text: "text-rose-500" },
};

function AdminOrdersContent() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, from, to]);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch<{
        orders: AdminOrderRow[];
        total: number;
      }>(`/api/admin/orders?${params.toString()}`);
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setRows(res.data.orders);
      setTotal(res.data.total);
      setLoading(false);
    },
    [debouncedSearch, statusFilter, from, to, page, pageSize],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  /* Detail modal */
  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    apiFetch<{ order: AdminOrderDetail }>(`/api/admin/orders/${openId}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error.message);
          setDetailLoading(false);
          return;
        }
        setDetail(res.data.order);
        setDetailLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load order");
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  return (
    <AdminShell activeKey="orders">
      <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
        <div className="flex flex-col gap-1 leading-normal">
          <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
            Orders
          </h1>
          <p className="text-[13px] text-ink-muted">
            {total.toLocaleString()} matching order
            {total === 1 ? "" : "s"} — platform-wide.
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-8">
        <section
          aria-label="Filters"
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 md:flex-row md:items-center md:flex-wrap"
        >
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 md:max-w-[320px] md:flex-1">
            <SearchSmallIcon size={16} />
            <input
              type="search"
              placeholder="Search id / customer / restaurant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
              aria-label="Search orders"
            />
          </div>

          <SelectField
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            label="Status"
          />

          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />

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

        <OrdersTable
          rows={rows}
          total={total}
          loading={loading}
          onOpen={setOpenId}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {openId ? (
        <OrderDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </AdminShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Select + date fields                                                       */
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
/*  Orders table                                                               */
/* -------------------------------------------------------------------------- */

function OrdersTable({
  rows,
  total,
  loading,
  onOpen,
}: {
  rows: AdminOrderRow[];
  total: number;
  loading: boolean;
  onOpen: (id: string) => void;
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
          {total === 0 ? "No orders match your filters" : "Nothing on this page"}
        </span>
        <p className="max-w-xs text-[13px] text-ink-muted">
          Try clearing the search or expanding the date range.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-2">
      <div className="hidden gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted md:grid md:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.4fr)_100px_120px_100px] lg:grid-cols-[110px_1.4fr_1.6fr_120px_140px_120px]">
        <span>Order</span>
        <span>Customer · Restaurant</span>
        <span>Rider · Placed</span>
        <span>Total</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.map((o) => {
          const tone = STATUS_TONE[o.status] ?? STATUS_TONE.pending;
          return (
            <li
              key={o.id}
              className="grid min-w-0 grid-cols-1 gap-y-2 rounded-xl border border-line bg-white p-3 transition-colors hover:bg-surface md:grid-cols-[110px_minmax(0,1.2fr)_minmax(0,1.4fr)_100px_120px_100px] md:items-center md:gap-3 lg:grid-cols-[110px_1.4fr_1.6fr_120px_140px_120px]"
            >
              <span className="font-display text-[13px] font-extrabold text-ink">
                {o.shortId}
              </span>

              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {o.customerName}
                </span>
                <span className="truncate text-[12px] text-ink-muted">
                  {o.restaurantName}
                </span>
              </div>

              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12px] text-ink-muted">
                  {o.riderName ?? "No rider assigned"}
                </span>
                <span className="truncate text-[11px] text-ink-muted">
                  {new Date(o.placedAt).toLocaleString()}
                </span>
              </div>

              <div className="flex min-w-0 flex-col items-end leading-tight">
                <span className="truncate font-display text-[13px] font-extrabold text-brand">
                  ৳{o.total.toLocaleString()}
                </span>
                {/* ধাপ ৪ — payment method + gateway state. COD orders
                    just say "Cash on delivery"; gateway orders show
                    whether SSLCommerz actually confirmed the money, so a
                    stuck PENDING / FAILED payment is visible without
                    opening the row. */}
                <span className="truncate text-[11px] text-ink-muted">
                  {o.paymentMethod === "CASH"
                    ? "Cash on delivery"
                    : `${PAYMENT_METHOD_LABEL[o.paymentMethod]} · ${gatewayStatusLabel(o.paymentGatewayStatus)}`}
                </span>
              </div>

              <span
                data-status={o.status}
                className={
                  "inline-flex w-fit items-center whitespace-nowrap rounded-[20px] px-2.5 py-1 text-[11px] font-semibold " +
                  tone.bg +
                  " " +
                  tone.text
                }
              >
                {o.statusLabel}
              </span>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(o.id)}
                  className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand"
                >
                  View
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

function OrderDetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: AdminOrderDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
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
      aria-label="Order detail"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Order
            </span>
            <span className="font-display text-[20px] font-extrabold text-ink">
              {detail?.shortId ?? "…"}
            </span>
          </div>
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
          <div className="h-[240px] animate-pulse rounded-xl border border-line bg-white" />
        ) : (
          <div className="flex flex-col gap-4">
            <Section title="Status">
              {(() => {
                const tone = STATUS_TONE[detail.status] ?? STATUS_TONE.pending;
                return (
                  <span
                    className={
                      "inline-flex w-fit items-center rounded-[20px] px-2.5 py-1 text-[12px] font-semibold " +
                      tone.bg +
                      " " +
                      tone.text
                    }
                  >
                    {detail.statusLabel}
                  </span>
                );
              })()}
            </Section>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Party label="Customer" name={detail.customer.name} sub={detail.customer.email ?? detail.customer.phone ?? "—"} />
              <Party label="Restaurant" name={detail.restaurant.name} sub={detail.restaurant.cuisine} />
              <Party
                label="Rider"
                name={detail.rider?.name ?? "—"}
                sub={detail.rider?.phone ?? "Not assigned"}
              />
            </div>

            <Section title="Items">
              <ul className="flex flex-col gap-1 rounded-xl border border-line bg-white">
                {detail.items.map((it) => (
                  <li
                    key={it.menuItemId}
                    className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] last:border-b-0"
                  >
                    <span className="font-semibold text-ink">
                      {it.qty}× {it.name}
                    </span>
                    <span className="text-ink-muted">
                      ৳{it.lineTotal.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Totals">
              <dl className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-white p-3 text-[13px]">
                <Row label="Subtotal" value={`৳${detail.subtotal.toLocaleString()}`} />
                <Row label="Delivery fee" value={`৳${detail.deliveryFee.toLocaleString()}`} />
                <Row label="Tax" value={`৳${detail.tax.toLocaleString()}`} />
                {detail.discountAmount > 0 ? (
                  <Row
                    label={`Discount${detail.promoCode ? ` (${detail.promoCode})` : ""}`}
                    value={`−৳${detail.discountAmount.toLocaleString()}`}
                  />
                ) : null}
                <Row label="Total" value={`৳${detail.total.toLocaleString()}`} bold />
                <Row label="Payment method" value={detail.paymentMethod} />
                {/* ধাপ ৪ — SSLCommerz state + transaction reference so an
                    admin can reconcile a disputed charge. COD orders never
                    touch the gateway, so we hide the status row for them. */}
                {detail.paymentMethod !== "CASH" ? (
                  <>
                    <Row
                      label="Gateway status"
                      value={gatewayStatusLabel(detail.paymentGatewayStatus)}
                    />
                    <Row
                      label="Gateway txn id"
                      value={detail.gatewayTransactionId ?? "—"}
                    />
                  </>
                ) : null}
                <Row label="Delivery address" value={detail.deliveryAddress} />
                <Row label="Placed" value={new Date(detail.placedAt).toLocaleString()} />
              </dl>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Party({ label, name, sub }: { label: string; name: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-white p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <span className="text-[13px] font-bold text-ink">{name}</span>
      <span className="text-[12px] text-ink-muted">{sub}</span>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <>
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd
        className={
          "text-[13px] " +
          (bold ? "font-extrabold text-brand" : "font-semibold text-ink")
        }
      >
        {value}
      </dd>
    </>
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
