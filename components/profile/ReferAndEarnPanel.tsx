"use client";

// components/profile/ReferAndEarnPanel.tsx
//
// Feat 6 — "Refer & Earn" tab in the customer profile.
//
// Surface:
//   • Big monospace copy of the customer's referral code with
//     a "Copy Code" button.
//   • A shareable URL (`{PUBLIC_BASE_URL}/register?ref=CODE`)
//     with its own "Copy Link" button.
//   • Counts: how many friends they invited, how many earned
//     the bonus (split PENDING vs REWARDED).
//   • Blurb: "Invite a friend — when they complete their first
//     order, you both get ৳50 in your KhaiDai Wallet!".
//
// Data comes from `GET /api/referral`. We re-fetch on mount
// and expose a manual "Refresh" button so the customer can
// see the REWARDED count tick up after a friend's first
// delivery without a hard reload.
//
// Copy feedback uses the browser Clipboard API. Older Safari
// / non-secure contexts fall back to a hidden textarea +
// document.execCommand("copy").

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/components/auth/AuthProvider";
import { useT } from "@/lib/i18n/LocaleProvider";

type ReferralResponse = {
  referralCode: string;
  shareUrl: string;
  pending: number;
  rewarded: number;
};

type CopyTarget = "code" | "link" | null;

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

export function ReferAndEarnPanel() {
  const { token, hydrating } = useAuth();
  const t = useT();
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyTarget>(null);

  useEffect(() => {
    if (hydrating) return;
    if (!token) {
      setLoading(false);
      setError("You need to be logged in to see this section.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await apiFetch<ReferralResponse>("/api/referral");
        if (cancelled) return;
        if (!r.ok) {
          const msg =
            r.status === 401
              ? "Session expired — please log in again."
              : r.status === 403
                ? "Referral program is only available to customer accounts."
                : "Could not load your referral details.";
          setError(msg);
          setData(null);
          return;
        }
        if (!r.data) {
          setError("Could not load your referral details.");
          setData(null);
          return;
        }
        setData(r.data);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message ?? "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, hydrating]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const r = await apiFetch<ReferralResponse>("/api/referral");
      if (r.ok && r.data) {
        setData(r.data);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy(target: "code" | "link", value: string) {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopyState(target);
      // Auto-clear the "Copied!" pill after a couple of seconds
      // so the button doesn't get stuck on success.
      setTimeout(() => {
        setCopyState((s) => (s === target ? null : s));
      }, 1800);
    }
  }

  if (loading && !data) {
    return (
      <PanelShell title={t("refer.title")}>
        <p className="text-sm text-text-muted">{t("refer.loading")}</p>
      </PanelShell>
    );
  }
  if (error && !data) {
    return (
      <PanelShell title={t("refer.title")}>
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="mt-3 rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-card"
        >
          {t("refer.retry")}
        </button>
      </PanelShell>
    );
  }
  if (!data) {
    return (
      <PanelShell title={t("refer.title")}>
        <p className="text-sm text-text-muted">
          {t("refer.empty")}
        </p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title={t("refer.title")}
      actions={
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-card disabled:opacity-50"
        >
          {loading ? t("refer.refreshing") : t("refer.refresh")}
        </button>
      }
    >
      <p className="text-sm text-text-muted">
        {t("refer.blurb")}
      </p>

      {/* Code card — big monospace, copy button right side. */}
      <div className="rounded-lg border border-border bg-surface-card p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("refer.yourReferralCode")}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div
            className="select-all rounded-md bg-white px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-brand-700"
            aria-label={t("refer.yourReferralCode")}
          >
            {data.referralCode}
          </div>
          <button
            type="button"
            onClick={() => copy("code", data.referralCode)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {copyState === "code" ? t("refer.copied") : t("refer.copyCode")}
          </button>
        </div>
      </div>

      {/* Share-link card — pre-filled URL with its own button. */}
      <div className="rounded-lg border border-border bg-surface-card p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("refer.shareableLink")}
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            type="text"
            readOnly
            value={data.shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("refer.shareLinkLabel")}
            className="min-w-px flex-1 truncate rounded-md border border-border bg-white px-3 py-2 font-mono text-sm text-text"
          />
          <button
            type="button"
            onClick={() => copy("link", data.shareUrl)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {copyState === "link" ? t("refer.copied") : t("refer.copyLink")}
          </button>
        </div>
      </div>

      {/* Counts. We treat 0-referrals as a deliberate state, not
          an error — the customer just hasn't invited anyone yet. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CountCard
          label={t("refer.friendsInvited")}
          value={data.pending + data.rewarded}
          tone="default"
        />
        <CountCard
          label={t("refer.pending")}
          value={data.pending}
          hint={t("refer.pendingHint")}
          tone="muted"
        />
        <CountCard
          label={t("refer.rewarded")}
          value={data.rewarded}
          hint={t("refer.rewardedHint")}
          tone="success"
        />
      </div>
    </PanelShell>
  );
}

/**
 * Generic panel chrome — title bar at the top, body slots in
 * a single column. Matches the visual weight of the other
 * panels (OrdersPanel, WalletPanel, …) so the profile page
 * stays consistent.
 */
function PanelShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface-page p-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {actions}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function CountCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone: "default" | "muted" | "success";
}) {
  const ring =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "muted"
        ? "border-border bg-surface-card text-text-muted"
        : "border-border bg-white text-text";
  return (
    <div className={`rounded-lg border px-4 py-3 ${ring}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </div>
  );
}