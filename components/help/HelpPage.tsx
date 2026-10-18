"use client";

import { useState } from "react";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { ChevronIcon, MailIcon, PhoneIcon } from "@/components/icons";
import { faqItems, helpContacts, type FaqItem } from "@/data/help";

/**
 * /help — customer-facing Help Center.
 *
 *   • Header — title + 1-line subtitle.
 *   • FAQ accordion — only one item open at a time, with chevron
 *     rotation. Same UX pattern as the rider help page, but uses
 *     our own data shape (data/help.ts).
 *   • Contact card — phone, email, hours. Real tel:/mailto: anchors.
 *
 * Uses the shared TopNav + Footer chrome so it feels part of the
 * customer app.
 */
export function HelpPage() {
  const [openId, setOpenId] = useState<string | null>(faqItems[0]?.id ?? null);

  return (
    <main className="min-h-screen w-full bg-white">
      <TopNav />

      <section className="mx-auto w-full max-w-page px-6 pb-20 pt-10 md:px-[64px]">
        <header className="flex flex-col gap-2 pb-10">
          <h1 className="font-display text-[34px] font-extrabold leading-tight text-ink md:text-[40px]">
            Help Center
          </h1>
          <p className="max-w-[640px] text-[14px] text-ink-muted md:text-[15px]">
            Quick answers to the most common KhaiDai questions. Can't find
            what you're looking for? Reach out to our support team.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* FAQ accordion */}
          <ul
            aria-label="Frequently asked questions"
            className="flex flex-col gap-3"
          >
            {faqItems.map((item) => (
              <FaqRow
                key={item.id}
                item={item}
                open={item.id === openId}
                onToggle={() =>
                  setOpenId((cur) => (cur === item.id ? null : item.id))
                }
              />
            ))}
          </ul>

          {/* Contact card */}
          <aside
            aria-label="Contact support"
            className="flex h-fit flex-col gap-4 rounded-2xl border border-line bg-white p-6"
          >
            <h2 className="font-display text-[18px] font-extrabold text-ink">
              Contact Support
            </h2>
            <p className="text-[13px] text-ink-muted">
              Reach a real person on the channels below — every day from
              8 AM to 11 PM.
            </p>
            <ul className="flex flex-col gap-3">
              {helpContacts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-surface-soft px-3 py-3"
                >
                  <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand">
                    {c.id === "sup-phone" ? (
                      <PhoneIcon size={16} />
                    ) : c.id === "sup-email" ? (
                      <MailIcon size={16} />
                    ) : (
                      <PhoneIcon size={16} />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      {c.label}
                    </span>
                    {c.href === "#" ? (
                      <span className="truncate text-[14px] font-semibold text-ink">
                        {c.value}
                      </span>
                    ) : (
                      <a
                        href={c.href}
                        className="truncate text-[14px] font-semibold text-ink hover:text-brand"
                      >
                        {c.value}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  FAQ row                                                                   */
/* -------------------------------------------------------------------------- */

function FaqRow({
  item,
  open,
  onToggle,
}: {
  item: FaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-2xl border border-line bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${item.id}-answer`}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-display text-[15px] font-bold text-ink">
          {item.question}
        </span>
        <span
          className={
            "shrink-0 transition-transform " + (open ? "rotate-180" : "")
          }
        >
          <ChevronIcon size={18} />
        </span>
      </button>
      {open ? (
        <div
          id={`${item.id}-answer`}
          className="border-t border-line px-5 pb-4 pt-3 text-[14px] leading-relaxed text-ink-muted"
        >
          {item.answer}
        </div>
      ) : null}
    </li>
  );
}
