"use client";

import { RefreshCwIcon } from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";

/** Pull the first name off a full name. Falls back to "Admin". */
function firstName(full: string | null | undefined): string {
  if (!full) return "Admin";
  const first = full.trim().split(/\s+/)[0];
  return first || "Admin";
}

/**
 * White header strip that sits at the top of the admin dashboard
 * main column.
 *
 *   • White bg, bottom border `#e5e7eb`, padding 20px vertical /
 *     32px horizontal (matches the partner dashboard header).
 *   • Left = title-block (heading + sub-heading).
 *   • Right = "Last refreshed" timestamp + manual refresh button.
 *
 * The page-level orchestrator passes a `loadedAt` so the header
 * always reflects the latest successful overview fetch — the
 * refresh button re-runs the probe.
 */
export function AdminDashboardHeader({
  loadedAt,
  onRefresh,
  refreshing,
}: {
  /** Date the latest overview fetch returned. Null on first paint. */
  loadedAt: Date | null;
  /** Re-fetch handler — passed in so the page owns the data state. */
  onRefresh: () => void;
  /** True while a re-fetch is in flight; disables the button. */
  refreshing: boolean;
}) {
  const { user } = useAuth();
  const greetingName = firstName(user?.name);
  return (
    <header className="flex items-center justify-between border-b border-line bg-white px-8 py-5 w-full">
      <div className="flex flex-col gap-1 leading-normal">
        <h1 className="font-display text-[22px] font-extrabold text-ink md:text-[26px]">
          Admin overview
        </h1>
        <p className="text-[13px] text-ink-muted">
          Welcome back, {greetingName} — here&apos;s the state of the
          KhaiDai platform right now.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {loadedAt ? (
          <span className="hidden text-[11px] text-ink-muted md:inline-flex">
            Updated {loadedAt.toLocaleTimeString()}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh overview"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
        >
          <RefreshCwIcon
            size={14}
            className={refreshing ? "animate-spin" : undefined}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
