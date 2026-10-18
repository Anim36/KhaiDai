import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";

/**
 * Shared long-form legal-page chrome used by /terms and /privacy.
 *
 * Renders the same TopNav + Footer as the rest of the customer
 * app and a simple <header> + <section> stack of <h2> + paragraphs.
 * Intentionally minimal — purely a presentational wrapper.
 */
export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export function LongformPage({
  pill,
  title,
  intro,
  lastUpdated,
  sections,
}: {
  pill: string;
  title: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-6 pb-20 pt-10 md:px-[64px]">
        <header className="flex flex-col gap-3 pb-10">
          <span className="inline-flex w-fit items-center rounded-pill bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-brand">
            {pill}
          </span>
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[40px]">
            {title}
          </h1>
          <p className="max-w-[760px] text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            {intro}
          </p>
          <span className="text-[13px] text-ink-muted">
            Last updated: {lastUpdated}
          </span>
        </header>

        <div className="flex flex-col gap-10">
          {sections.map((s, i) => (
            <article key={i} className="flex flex-col gap-3">
              <h2 className="font-display text-[20px] font-extrabold text-ink md:text-[22px]">
                {s.heading}
              </h2>
              {s.paragraphs.map((p, j) => (
                <p
                  key={j}
                  className="text-[14px] leading-relaxed text-ink-muted md:text-[15px]"
                >
                  {p}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
