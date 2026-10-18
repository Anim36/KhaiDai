import type { Metadata } from "next";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";

export const metadata: Metadata = {
  title: "Search · KhaiDai",
  description:
    "Search across restaurants, cuisines, and dishes available on KhaiDai.",
};

/**
 * /search?q=&lat=&lng= — full search result grid.
 *
 * Reads the q/lat/lng query params server-side and forwards them to
 * the client orchestrator. The orchestrator owns the live-fetch
 * lifecycle (debounced refetch on input changes, location-aware
 * filtering, empty-state rendering) so this route stays a thin
 * server component.
 */
export default function SearchRoute({
  searchParams,
}: {
  searchParams: { q?: string; lat?: string; lng?: string };
}) {
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const lat =
    typeof searchParams.lat === "string" ? Number(searchParams.lat) : null;
  const lng =
    typeof searchParams.lng === "string" ? Number(searchParams.lng) : null;
  const origin =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
      ? { lat, lng }
      : null;
  return <SearchResultsPage initialQuery={q} origin={origin} />;
}
