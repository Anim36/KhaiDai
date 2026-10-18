import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { MailIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import { ContactForm } from "./ContactForm";

/**
 * /contact — contact form + company contact info.
 *
 * Server-rendered. The form (ContactForm) is the only client
 * subtree because it owns local input + submit state.
 */
export function ContactPage() {
  // Public support email — overridable via env so deployments can
  // route "Contact us" to a real mailbox without a code change.
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "info.khaidai@gmail.com";
  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-6 pb-20 pt-10 md:px-[64px]">
        <header className="flex flex-col gap-3 pb-10">
          <span className="inline-flex w-fit items-center rounded-pill bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-brand">
            Contact
          </span>
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[40px]">
            We'd love to hear from you.
          </h1>
          <p className="max-w-[680px] text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            Questions, feedback, or a partnership idea? Drop us a line —
            our team reads every message.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <ContactForm />

          <aside
            aria-label="Company contact info"
            className="flex h-fit flex-col gap-4 rounded-2xl border border-line bg-surface-soft p-6 md:p-8"
          >
            <h2 className="font-display text-[18px] font-extrabold text-ink">
              KhaiDai HQ
            </h2>
            <ContactRow
              icon={<MapPinIcon size={18} />}
              label="Address"
              value={
                <>
                  House 12, Road 7
                  <br />
                  Matuail, Dhaka 1213
                </>
              }
            />
            <ContactRow
              icon={<PhoneIcon size={18} />}
              label="Phone"
              value={
                <a
                  href="tel:+8801753226124"
                  className="hover:text-brand"
                >
                  +880 1753-226142
                </a>
              }
            />
            <ContactRow
              icon={<MailIcon size={18} />}
              label="Email"
              value={
                <a
                  href={`mailto:${supportEmail}`}
                  className="hover:text-brand"
                >
                  {supportEmail}
                </a>
              }
            />
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className="text-[14px] font-semibold leading-relaxed text-ink">
          {value}
        </span>
      </div>
    </div>
  );
}
