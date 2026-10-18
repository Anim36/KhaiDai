import type { Metadata } from "next";
import { DishesPage } from "@/components/dishes/DishesPage";

// The page `<title>` is rendered by the browser before the client
// LocaleProvider hydrates, so we keep a generic English default and
// let the in-page H1 (which already translates via `t()`) carry the
// localised copy. The `KhaiDai` brand suffix is intentional — it
// shouldn't be translated.
export const metadata: Metadata = {
  title: "Trending Dishes · KhaiDai",
  description:
    "Browse every trending dish from KhaiDai's top partner restaurants and add it to your cart in one tap.",
};

/**
 * /dishes — server route delegating to the client orchestrator.
 * The orchestrator owns the filter state + cart wiring so the
 * route stays a thin Server Component for SEO + clean metadata.
 */
export default function DishesRoute() {
  return <DishesPage />;
}
