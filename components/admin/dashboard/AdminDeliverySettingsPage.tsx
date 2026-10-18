"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { apiFetch } from "@/lib/apiClient";
import {
  computeDeliveryFee,
  computeRiderEarning,
} from "@/lib/delivery-fee-math";

/**
 * /admin/settings/delivery
 *
 * Edits the single-active `DeliveryFeeConfig` row. The form fields
 * map 1:1 to the schema; "Fee calculator" preview uses the same
 * helpers `lib/delivery-fee.ts` exports so the numbers shown to
 * a customer at checkout always match.
 *
 * Save → PATCH /api/admin/delivery-config. Audit log records both
 * old and new values via `recordAuditEvent`.
 */

type FormState = {
  baseFee: number;
  includedKm: number;
  perKmRate: number;
  minFee: number;
  maxFee: number;
  riderSharePercent: number;
};

export function AdminDeliverySettingsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewDistance, setPreviewDistance] = useState(3);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{
      config: {
        baseFee: number;
        includedKm: number;
        perKmRate: number;
        minFee: number;
        maxFee: number;
        riderSharePercent: number;
        updatedAt: string | null;
      };
    }>("/api/admin/delivery-config");
    if (!res.ok) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    if (!res.data) {
      setError("Empty response");
      setLoading(false);
      return;
    }
    setError(null);
    const c = res.data.config;
    const next: FormState = {
      baseFee: c.baseFee,
      includedKm: c.includedKm,
      perKmRate: c.perKmRate,
      minFee: c.minFee,
      maxFee: c.maxFee,
      riderSharePercent: c.riderSharePercent,
    };
    setForm(next);
    setOriginal(next);
    setSavedAt(c.updatedAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave() {
    if (!form || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ ok: boolean; config: { updatedAt: string } }>(
      "/api/admin/delivery-config",
      { method: "PATCH", body: JSON.stringify(form) },
    );
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setOriginal(form);
    setSavedAt(res.data?.config?.updatedAt ?? new Date().toISOString());
  }

  const dirty = !!form && !!original && JSON.stringify(form) !== JSON.stringify(original);
  const valid =
    !!form &&
    form.minFee <= form.maxFee &&
    form.riderSharePercent >= 0 &&
    form.riderSharePercent <= 100 &&
    form.baseFee >= 0 &&
    form.perKmRate >= 0 &&
    form.includedKm >= 0;

  const previewFee = form ? computeDeliveryFee(form, previewDistance) : 0;
  const previewEarning = form
    ? computeRiderEarning(form, previewFee)
    : 0;

  return (
    <RequireAuth role="ADMIN">
      <AdminShell activeKey="delivery">
        {/* Bug 2 — match the Dashboard's `p-8` outer padding so
            every admin page reads as one design system. */}
        <div className="flex flex-1 flex-col gap-6 p-8">
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-[24px] font-extrabold text-ink md:text-[28px]">
              Delivery Settings
            </h1>
            <p className="text-[13px] text-ink-muted">
              Platform-wide delivery fee configuration. Changes apply
              immediately at checkout; the previous values are kept in
              the audit log.
            </p>
          </header>

          {loading ? (
            <p className="text-ink-muted">Loading…</p>
          ) : !form ? (
            <p className="text-rose-600">Failed to load config.</p>
          ) : (
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
                <h2 className="font-display text-[16px] font-bold text-ink">
                  Fee formula
                </h2>
                <Field
                  label="Base fee (Taka)"
                  value={form.baseFee}
                  onChange={(v) =>
                    setForm({ ...form, baseFee: asNumber(v) })
                  }
                />
                <Field
                  label="Included kilometres"
                  value={form.includedKm}
                  onChange={(v) =>
                    setForm({ ...form, includedKm: asNumber(v) })
                  }
                  step={0.1}
                />
                <Field
                  label="Per-km rate (Taka)"
                  value={form.perKmRate}
                  onChange={(v) =>
                    setForm({ ...form, perKmRate: asNumber(v) })
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Min fee (Taka)"
                    value={form.minFee}
                    onChange={(v) =>
                      setForm({ ...form, minFee: asNumber(v) })
                    }
                  />
                  <Field
                    label="Max fee (Taka)"
                    value={form.maxFee}
                    onChange={(v) =>
                      setForm({ ...form, maxFee: asNumber(v) })
                    }
                  />
                </div>
                <Field
                  label="Rider share (%)"
                  value={form.riderSharePercent}
                  onChange={(v) =>
                    setForm({ ...form, riderSharePercent: asNumber(v) })
                  }
                />

                {error ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600"
                  >
                    {error}
                  </p>
                ) : null}

                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-ink-muted">
                    {savedAt
                      ? `Last saved: ${new Date(savedAt).toLocaleString()}`
                      : "Not yet saved."}
                  </p>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || !valid || submitting}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6">
                <h2 className="font-display text-[16px] font-bold text-ink">
                  Fee calculator
                </h2>
                <p className="text-[12px] text-ink-muted">
                  Plug in a sample distance to preview the customer fee and
                  rider earning that these settings would produce.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                    Distance (km)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={previewDistance}
                    onChange={(e) =>
                      setPreviewDistance(asNumber(e.target.value))
                    }
                    className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <Tile label="Customer fee" value={`৳${previewFee}`} />
                  <Tile
                    label={`Rider earning (${form.riderSharePercent}%)`}
                    value={`৳${previewEarning}`}
                  />
                </div>

                <p className="text-[11px] text-ink-muted">
                  Formula:{" "}
                  <code className="rounded bg-surface px-1.5 py-0.5 text-[11px]">
                    base + perKm × max(0, km − included), clamp(min, max)
                  </code>
                </p>
              </div>
            </section>
          )}
        </div>
      </AdminShell>
    </RequireAuth>
  );
}

function asNumber(v: string | number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(asNumber(e.target.value))}
        className="h-12 rounded-xl border border-line bg-white px-4 text-[14px] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-[18px] font-extrabold text-ink">
        {value}
      </p>
    </div>
  );
}
