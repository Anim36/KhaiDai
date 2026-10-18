"use client";

import Link from "next/link";
import { ShieldIcon } from "@/components/icons";

/**
 * Two-column shell used by /admin/login. The form column is
 * 480px (vs the partner's 600px) so the admin UI feels a bit more
 * compact and data-oriented. The hero column swaps the food photo
 * for a neutral brand panel describing the admin's role.
 *
 * The form body is rendered by the parent page and passed in as
 * `children`, the same way the partner auth layout works.
 */
export function AdminAuthLayout({
  children,
  footerNote,
  formHeader,
}: {
  children: React.ReactNode;
  /** Short helper text rendered below the form. */
  footerNote: React.ReactNode;
  /** Optional heading + subtitle pair rendered above the form body. */
  formHeader?: {
    title: string;
    subtitle: React.ReactNode;
  };
}) {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white">
      <AdminHeroPanel />

      {/* Form panel — 480px fixed-width column. Tighter than the
          partner layout so the admin feels more compact + utility. */}
      <div className="w-full md:w-[480px] md:shrink-0 flex-1 flex items-center justify-center bg-white px-6 py-12 md:px-12 md:py-20">
        <div className="w-full max-w-md flex flex-col gap-8">
          {/* Brand badge — KhaiDai wordmark + "Admin" sub-tag. Links
              stay inside the admin portal (back to the login, since
              we don't have a public admin homepage). */}
          <Link
            href="/admin/login"
            data-brand-link="admin"
            aria-label="KhaiDai Admin"
            className="flex items-center gap-[10px] cursor-pointer"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
              <ShieldIcon size={24} />
            </span>
            <span className="font-display text-[24px] font-extrabold text-ink leading-none">
              KhaiDai Admin
            </span>
          </Link>

          {formHeader ? (
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[24px] font-extrabold leading-[1.2] text-ink md:text-[28px]">
                {formHeader.title}
              </h1>
              <p className="text-[14px] font-normal text-ink-muted leading-[1.4]">
                {formHeader.subtitle}
              </p>
            </div>
          ) : null}

          {children}

          <p className="text-center text-[13px] text-ink-muted mt-2">
            {footerNote}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Left-side hero panel for the admin login. Brand-coloured
 * gradient with a short caption describing what the admin can do.
 * No food photo — admins are a back-office role, not a customer-
 * facing one, so the panel reads more like an internal tool's
 * sign-in page.
 */
function AdminHeroPanel() {
  return (
    <aside
      aria-hidden
      className="hidden md:flex md:w-[1fr] md:flex-1 flex-col justify-between p-16 text-white relative overflow-hidden"
      style={{
        background:
          "linear-gradient(140deg, #ff4d30 0%, #ff7a59 60%, #ffb84d 100%)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <ShieldIcon size={22} />
        </span>
        <span className="font-display text-[20px] font-extrabold">
          KhaiDai Platform
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="font-display text-[40px] font-extrabold leading-[1.05]">
          One place to run KhaiDai.
        </h2>
        <p className="max-w-md text-[16px] leading-[1.5] opacity-90">
          Manage users, restaurants, and orders across the entire
          platform. Suspend bad actors, audit moderation actions, and
          keep the catalog honest — all from a single dashboard.
        </p>

        <ul className="flex flex-col gap-3 text-[14px] leading-[1.4]">
          <li className="flex items-center gap-3">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
            Platform-wide metrics and 7-day order trend
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
            Suspend / reinstate any user or restaurant
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
            Read-only audit trail for every moderation action
          </li>
        </ul>
      </div>

      <span className="text-[12px] uppercase tracking-wide opacity-80">
        Admin sign-in · Internal use only
      </span>
    </aside>
  );
}
