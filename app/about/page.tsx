import type { Metadata } from "next";
import { AboutPage } from "@/components/about/AboutPage";

export const metadata: Metadata = {
  title: "About Us · KhaiDai",
  description:
    "Learn about KhaiDai — our mission, story, and the team behind your favourite food delivery experience.",
};

/**
 * /about — server route delegating to the orchestrator.
 */
export default function AboutRoute() {
  return <AboutPage />;
}
