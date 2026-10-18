"use client";

import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * /about — KhaiDai company story, mission, and team placeholders.
 *
 * Server-rendered. Reuses the shared TopNav + Footer chrome so the
 * page reads as part of the customer flow. Body is intentionally
 * light: an introductory hero, a 3-card "what we stand for" strip,
 * a team grid, and a closing line.
 */
export function AboutPage() {
  const t = useT();
  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-6 pb-20 pt-10 md:px-[64px]">
        {/* Intro */}
        <header className="flex flex-col gap-3 pb-12 md:pb-16">
          <span className="inline-flex w-fit items-center rounded-pill bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-brand">
            {t("about.tag")}
          </span>
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[44px]">
            {t("about.title")}
          </h1>
          <p className="max-w-[760px] text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            {t("about.intro")}
          </p>
        </header>

        {/* Mission strip */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MissionCard
            title={t("about.missionTitle")}
            body={t("about.missionBody")}
          />
          <MissionCard
            title={t("about.valuesTitle")}
            body={t("about.valuesBody")}
          />
          <MissionCard
            title={t("about.visionTitle")}
            body={t("about.visionBody")}
          />
        </div>

        {/* Story */}
        <article className="flex flex-col gap-4 pb-12 pt-16">
          <h2 className="font-display text-[24px] font-extrabold text-ink md:text-[28px]">
            {t("about.storyTitle")}
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            {t("about.storyBody")}
          </p>
          <p className="text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            {t("about.storyClosing")}
          </p>
        </article>

        {/* Team — single real member placeholder. Expanded as the
            team grows. */}
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-[24px] font-extrabold text-ink md:text-[28px]">
            {t("about.teamTitle")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <TeamCard name={teamMember.name} role={teamMember.role} />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function MissionCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-6">
      <h3 className="font-display text-[18px] font-extrabold text-ink">
        {title}
      </h3>
      <p className="text-[14px] leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

function TeamCard({ name, role }: { name: string; role: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-[16px] font-extrabold text-brand"
      >
        {initials}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-display text-[15px] font-bold text-ink">
          {name}
        </span>
        <span className="truncate text-[13px] text-ink-muted">{role}</span>
      </div>
    </div>
  );
}

// Single real team member shown on /about. Add more here as the
// team grows.
const teamMember = {
  name: "Taj Mohammad Anim",
  role: "Founder & Developer",
};
