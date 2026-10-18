"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

/**
 * usePartnerEarnings — single source of truth for the partner
 * earnings page.
 *
 * Fetches `/api/partner/earnings`, exposes the typed payload, and
 * offers a `refresh()` so the PayoutDetails modal can refetch
 * after a successful POST.
 *
 * The earnings page is wrapped in `<RequireAuth role="PARTNER" />`,
 * so the JWT is always present by the time this hook runs.
 */

export type EarningsSummaryCard = {
  id: "today" | "week" | "month";
  labelKey: string;
  /** Resolved client-side. May be null when there's no data so the
   *  row falls back to a generic "—" caption. */
  captionKey: string | null;
  value: string;
  tone: "red" | "blue" | "yellow";
};

export type EarningsRevenuePoint = {
  date: string; // YYYY-MM-DD
  label: string; // "12 Apr"
  amount: number;
};

export type EarningsTransaction = {
  id: string;
  date: string;
  orderId: string;
  amount: string;
  status: "paid" | "pending";
};

export type EarningsPayout = {
  id: string;
  date: string;
  amount: string;
  method: "BKASH" | "NAGAD" | "ROCKET" | "CARD";
  destination: string;
  note: string | null;
  status: "paid" | "pending";
};

export type PartnerEarnings = {
  summary: { today: number; week: number; month: number };
  summaryCards: EarningsSummaryCard[];
  dailyRevenue: EarningsRevenuePoint[];
  transactions: EarningsTransaction[];
  balance: number;
  minPayout: number;
  canRequestPayout: boolean;
  payouts: EarningsPayout[];
};

export type PartnerEarningsState =
  | { kind: "loading" }
  | { kind: "ready"; data: PartnerEarnings }
  | { kind: "error"; message: string }
  | { kind: "empty" }; // partner hasn't created a restaurant yet

export function usePartnerEarnings(): {
  state: PartnerEarningsState;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<PartnerEarningsState>({
    kind: "loading",
  });

  const refresh = useCallback(async () => {
    setState((prev) => (prev.kind === "ready" ? { kind: "loading" } : prev));
    const res = await apiFetch<PartnerEarnings>("/api/partner/earnings");
    if (res.status === 204) {
      setState({ kind: "empty" });
      return;
    }
    if (!res.ok) {
      setState({ kind: "error", message: res.error.message });
      return;
    }
    if (!res.data) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "ready", data: res.data });
  }, []);

  useEffect(() => {
    refresh().catch((err) =>
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load earnings",
      }),
    );
  }, [refresh]);

  return { state, refresh };
}
