"use client";

// components/rider/dashboard/RiderLeaderboardPage.tsx
//
// Feat 2 — Rider Leaderboard / Incentive.
//
// Two pieces of UI:
//
//   1. Top-10 leaderboard — paginated card list, gold/silver/
//      bronze tint on the top three.
//   2. Self-rank card — pinned at the bottom. Shows your rank
//      (or "no deliveries yet" copy), plus a "🎉 You've
//      unlocked this week's bonus!" badge when you've hit
//      ≥ 20 DELIVERED orders in the current Sun–Sat window.
//
// Privacy — the page renders `maskedName` from the API only.
// The raw user name is never rendered.

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RiderShell } from "@/components/rider/dashboard/RiderShell";
import { apiFetch } from "@/lib/apiClient";
import { useT } from "@/lib/i18n/LocaleProvider";

type LeaderboardResponse = {
  period: { label: string; weekStart: string; weekEnd: string };
  threshold: number;
  thresholdUnlocked: boolean;
  ranking: Array<{
    rank: number;
    riderId: string;
    maskedName: string;
    deliveries: number;
    earnings: number;
  }>;
  selfRank: {
    rank: number;
    riderId: string;
    maskedName: string;
    deliveries: number;
    earnings: number;
  } | null;
  totalRidersRanked: number;
};

function formatTaka(n: number): string {
  return `৳${n.toLocaleString("en-IN")}`;
}

function medalColour(rank: number): string {
  if (rank === 1) return "bg-amber-100 text-amber-800 border-amber-300";
  if (rank === 2) return "bg-slate-100 text-slate-700 border-slate-300";
  if (rank === 3) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-white text-ink border-line";
}

export function RiderLeaderboardPage() {
  return (
    <RequireAuth role="RIDER">
      <RiderLeaderboardContent />
    </RequireAuth>
  );
}

function RiderLeaderboardContent() {
  const t = useT();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<LeaderboardResponse>(
        `/api/riders/leaderboard?period=week`,
      );
      if (!res.ok) {
        setError(res.error.message || t("rider.leaderboard.loadFailed"));
        return;
      }
      if (!res.data) {
        setError(t("rider.leaderboard.emptyResponse"));
        return;
      }
      setData(res.data);
    } catch (e) {
      setError((e as Error).message ?? t("rider.leaderboard.networkError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return (
    <RiderShell activeKey="leaderboard">
        <header className="flex flex-col gap-1 border-b border-line bg-white px-8 py-5">
          <h1 className="text-2xl font-bold text-ink">
            {t("rider.leaderboard.headerTitle")}
          </h1>
          {data ? (
            <p className="text-sm text-ink-muted">
              {data.period.label} ·{" "}
              {t("rider.leaderboard.headerSubtitleRiderCount_other", {
                n: data.totalRidersRanked,
              })}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              {t("rider.leaderboard.headerSubtitleLoading")}
            </p>
          )}
        </header>

        <div className="flex flex-1 flex-col gap-6 p-8">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
            >
              {error}
              <button
                type="button"
                onClick={() => refresh().catch(() => {})}
                className="ml-3 underline"
              >
                {t("rider.leaderboard.retry")}
              </button>
            </div>
          ) : null}

          {loading && !data ? <SkeletonList /> : null}

          {data ? (
            <>
              <ThresholdBadge data={data} />
              <RankingList ranking={data.ranking} />
              <SelfRankCard data={data} />
            </>
          ) : null}
        </div>
      </RiderShell>
  );
}

function ThresholdBadge({ data }: { data: LeaderboardResponse }) {
  const t = useT();
  const deliveries = data.selfRank?.deliveries ?? 0;
  const remaining = data.threshold - deliveries;
  const pct = Math.min(100, Math.round((deliveries / data.threshold) * 100));
  const reached = data.thresholdUnlocked;
  return (
    <section
      role="status"
      className={
        "flex items-center justify-between rounded-xl border p-4 " +
        (reached
          ? "border-emerald-300 bg-emerald-50"
          : "border-line bg-white")
      }
    >
      <div>
        <div className="text-base font-semibold text-ink">
          {reached
            ? t("rider.leaderboard.thresholdUnlocked")
            : t("rider.leaderboard.thresholdRemaining_other", {
                n: remaining,
              })}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {t("rider.leaderboard.thresholdHelp", { n: data.threshold })}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <div className="text-2xl font-bold text-ink">
          {deliveries}/{data.threshold}
        </div>
        <div className="mt-1 h-2 w-32 overflow-hidden rounded-full bg-line">
          <div
            className={"h-full " + (reached ? "bg-emerald-500" : "bg-brand")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function RankingList({ ranking }: { ranking: LeaderboardResponse["ranking"] }) {
  const t = useT();
  if (ranking.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-white p-6 text-sm text-ink-muted">
        {t("rider.leaderboard.emptyThisWeek")}
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-ink">
          {t("rider.leaderboard.topTenTitle")}
        </h2>
        <p className="text-xs text-ink-muted">
          {t("rider.leaderboard.topTenSubtitle")}
        </p>
      </header>
      <ol className="flex flex-col gap-2">
        {ranking.map((row) => (
          <li
            key={row.riderId}
            className={
              "flex items-center justify-between rounded-md border px-4 py-3 text-sm " +
              medalColour(row.rank)
            }
          >
            <span className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                {row.rank}
              </span>
              <span className="font-semibold text-ink">{row.maskedName}</span>
            </span>
            <span className="flex items-center gap-4 text-ink-muted">
              <span>
                {t("rider.leaderboard.deliveriesCount_other", {
                  n: row.deliveries,
                })}
              </span>
              <span className="font-bold text-ink">
                {formatTaka(row.earnings)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SelfRankCard({ data }: { data: LeaderboardResponse }) {
  const t = useT();
  const sr = data.selfRank;
  if (!sr) {
    return (
      <section className="rounded-xl border border-dashed border-line bg-white p-5">
        <h2 className="text-base font-semibold text-ink">
          {t("rider.leaderboard.selfRankTitle")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t("rider.leaderboard.selfRankEmpty")}
        </p>
      </section>
    );
  }
  const inTop = sr.rank <= 10;
  return (
    <section
      className={
        "flex items-center justify-between rounded-xl border p-5 " +
        (inTop
          ? "border-emerald-300 bg-emerald-50"
          : "border-line bg-white")
      }
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("rider.leaderboard.selfRankLabel", {
            rank: sr.rank,
            total: data.totalRidersRanked,
          })}
        </div>
        <div className="mt-1 text-base font-semibold text-ink">
          {sr.maskedName}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {t("rider.leaderboard.selfRankWeek_other", {
            n: sr.deliveries,
            amount: formatTaka(sr.earnings),
          })}
        </p>
      </div>
      {inTop ? (
        <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          {t("rider.leaderboard.inTopTen")}
        </span>
      ) : (
        <span className="rounded-full bg-line px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
          {t("rider.leaderboard.keepGoing")}
        </span>
      )}
    </section>
  );
}

function SkeletonList() {
  const t = useT();
  return (
    <div
      role="status"
      className="flex flex-col gap-3"
      aria-label={t("rider.leaderboard.skeletonAria")}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[60px] animate-pulse rounded-xl border border-line bg-white"
        />
      ))}
    </div>
  );
}