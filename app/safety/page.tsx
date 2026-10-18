import type { Metadata } from "next";
import { SafetyPage } from "@/components/safety/SafetyPage";

export const metadata: Metadata = {
  title: "Safety · KhaiDai",
  description:
    "How KhaiDai keeps your food, your data, and your deliveries safe — guidelines for restaurants and riders.",
};

/**
 * /safety — server route delegating to the orchestrator.
 */
export default function SafetyRoute() {
  return <SafetyPage />;
}
