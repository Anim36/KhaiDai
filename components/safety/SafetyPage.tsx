import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";

/**
 * /safety — KhaiDai safety guidelines.
 *
 * Static, server-rendered page. Body is intentionally light:
 * a hero, two main sections (Food Safety + Delivery Safety),
 * each broken into a few sub-paragraphs.
 */
export function SafetyPage() {
  // Public safety contact — overridable via env so deployments can
  // route to a real mailbox without a code change.
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "info.khaidai@gmail.com";
  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-6 pb-20 pt-10 md:px-[64px]">
        <header className="flex flex-col gap-3 pb-12">
          <span className="inline-flex w-fit items-center rounded-pill bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-brand">
            Safety
          </span>
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[40px]">
            Your safety is part of every order.
          </h1>
          <p className="max-w-[720px] text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            From the kitchen to your doorstep, KhaiDai holds every partner
            restaurant and rider to a clear set of safety standards. Here's
            how we keep your food clean, your data safe, and your delivery
            on track.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SafetyCard
            title="Food Safety"
            items={[
              "Every partner restaurant must hold a valid trade licence and a current BSTI / local health permit before going live on KhaiDai.",
              "Restaurants are inspected on a rolling basis by our local operations team, with food-handling, storage, and expiry checks.",
              "We do not allow any partner to advertise or sell expired, repackaged, or homemade items through the platform.",
              "If your order arrives in unsatisfactory condition — broken seal, spilt, or visibly stale — contact support within 24 hours for a refund or credit.",
            ]}
          />
          <SafetyCard
            title="Delivery Safety"
            items={[
              "All riders pass identity, address, and contact verification before their first delivery.",
              "Riders are trained on insulated-bag use, contact-free drop-off, and traffic-safety rules specific to Dhaka roads.",
              "Live order tracking lets you see exactly where your food is at every step — no more guessing.",
              "If you ever feel unsafe during a delivery, use the in-app SOS button to alert our 24/7 ops team and local emergency services.",
            ]}
          />
        </div>

        <article className="mt-12 flex flex-col gap-4 rounded-2xl border border-line bg-surface-soft p-6 md:p-8">
          <h2 className="font-display text-[20px] font-extrabold text-ink">
            Reporting a safety concern
          </h2>
          <p className="text-[14px] leading-relaxed text-ink-muted md:text-[15px]">
            If you spot a safety issue with a restaurant, a rider, or an
            order, please contact us at{" "}
            <a
              href={`mailto:${supportEmail}`}
              className="font-semibold text-brand hover:underline"
            >
              {supportEmail}
            </a>{" "}
            or call the support line on the Help page. Every report is
            reviewed within 24 hours and, where appropriate, escalated to
            our Trust & Safety team.
          </p>
        </article>
      </section>

      <Footer />
    </main>
  );
}

function SafetyCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 md:p-8">
      <h2 className="font-display text-[20px] font-extrabold text-ink">
        {title}
      </h2>
      <ul className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-muted md:text-[15px]">
        {items.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden
              className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
