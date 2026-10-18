"use client";

import type { ComponentType, SVGProps } from "react";
import { MapPinIcon } from "@/components/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Two-letter initials for the avatar fallback (e.g. "Rahim Ahmed" -> "RA").
 * Falls back to "?" if the name is missing or empty.
 */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0] ?? "").join("");
  return (letters || "?").toUpperCase();
}

/**
 * Profile-sidebar tab definition. The value is what the orchestrator
 * writes to React state; `Icon` is the 18×18 stroke icon shown to the
 * left of the label.
 */
export type ProfileTabId =
  | "orders"
  | "addresses"
  | "payment"
  | "wallet"
  | "refer"
  | "favorites"
  | "settings";

type Props = {
  active: ProfileTabId;
  onSelect: (id: ProfileTabId) => void;
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/**
 * Inline sidebar icons that match the Figma `customer-profile` frame.
 * They follow the same `<svg … viewBox 0 0 18 18>` shape as the rest of
 * the shared icon set so `currentColor` keeps them themed through Tailwind.
 */
function ReceiptIcon({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p} aria-hidden>
      <path
        d="M3.5 1.5H14.5V16.5L13 15L11.5 16.5L10 15L8.5 16.5L7 15L5.5 16.5L4 15L3.5 16.5V1.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 5.5H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 8.5H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 11.5H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p} aria-hidden>
      <rect
        x="2"
        y="4"
        width="14"
        height="10.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M2 7.5H16" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12.25" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

function HeartIcon({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p} aria-hidden>
      <path
        d="M9 16C9 16 2.5 12.2 2.5 7.2C2.5 5.2 4 3.5 6 3.5C7.2 3.5 8.3 4.1 9 5.1C9.7 4.1 10.8 3.5 12 3.5C14 3.5 15.5 5.2 15.5 7.2C15.5 12.2 9 16 9 16Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p} aria-hidden>
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9 1.5V3.5M9 14.5V16.5M16.5 9H14.5M3.5 9H1.5M14.6 3.4L13.2 4.8M4.8 13.2L3.4 14.6M14.6 14.6L13.2 13.2M4.8 4.8L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Feat 6 — "Refer & Earn" sidebar icon. Small gift-box glyph.
 */
function GiftIcon({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p} aria-hidden>
      <rect x="2" y="4.5" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 4.5V15.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 8H16" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9 4.5C9 3 7.5 2 6.5 2C5.5 2 4.5 2.5 4.5 3.5C4.5 4.5 6 4.5 9 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 4.5C9 3 10.5 2 11.5 2C12.5 2 13.5 2.5 13.5 3.5C13.5 4.5 12 4.5 9 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type TabLabelKey =
  | "profile.sidebar.myOrders"
  | "profile.sidebar.deliveryAddresses"
  | "profile.sidebar.paymentMethods"
  | "profile.sidebar.myWallet"
  | "profile.sidebar.referEarn"
  | "profile.sidebar.myFavorites"
  | "profile.sidebar.accountSettings";

const TABS: { id: ProfileTabId; labelKey: TabLabelKey; Icon: IconComponent }[] = [
  { id: "orders", labelKey: "profile.sidebar.myOrders", Icon: ReceiptIcon },
  {
    id: "addresses",
    labelKey: "profile.sidebar.deliveryAddresses",
    Icon: MapPinIcon,
  },
  {
    id: "payment",
    labelKey: "profile.sidebar.paymentMethods",
    Icon: WalletIcon,
  },
  // Feat 3+4+5 — KhaiDai Wallet. Reuses the wallet icon; the label
  // distinguishes "Payment Methods" (saved cards/accounts) from
  // "My Wallet" (the platform balance + loyalty tokens).
  { id: "wallet", labelKey: "profile.sidebar.myWallet", Icon: WalletIcon },
  // Feat 6 — Customer referral program. Lets the customer copy
  // their code/share-link and see how many friends have joined.
  { id: "refer", labelKey: "profile.sidebar.referEarn", Icon: GiftIcon },
  {
    id: "favorites",
    labelKey: "profile.sidebar.myFavorites",
    Icon: HeartIcon,
  },
  {
    id: "settings",
    labelKey: "profile.sidebar.accountSettings",
    Icon: GearIcon,
  },
];

/**
 * Left rail of the `/profile` page. Mirrors the Figma `profile-sidebar`
 * block: white card with rounded corners, top user-card row, divider
 * then a vertical stack of selectable items. Active row gets the brand
 * pill background (#FFEBE8 / brand-100) + brand-coloured icon + label.
 */
export function ProfileSidebar({ active, onSelect }: Props) {
  const { user } = useAuth();
  const { avatar } = useUserAvatar(user?.id);
  const t = useT();
  // Pulled from the auth context so the sidebar mirrors whoever is
  // actually signed in. Falls back to placeholders only during the
  // pre-hydration tick (RequireAuth guards the page so this is rare).
  const displayName = user?.name ?? t("profile.sidebarMeta.guest");
  const initials = initialsOf(user?.name);
  const phone = user?.phone ?? t("profile.sidebarMeta.phoneNotSet");
  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 self-start rounded-card border border-line bg-white p-6 md:w-[300px]">
      {/* User card: oval avatar (image or initials) + name + phone */}
      <div className="flex w-full items-center gap-3">
        <div
          aria-hidden
          className="flex h-12 w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[27px] bg-brand-50 font-display text-[18px] font-extrabold text-brand"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="flex min-w-px flex-1 flex-col gap-0.5 leading-normal">
          <p className="w-full font-display text-[16px] font-bold text-ink">
            {displayName}
          </p>
          <p className="w-full text-[13px] font-normal text-ink-muted">
            {phone || "Phone not set"}
          </p>
        </div>
      </div>

      <div className="h-px w-full bg-line" />

      {/* Tab list */}
      <div className="flex w-full flex-col gap-2">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={
                "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-display font-bold transition-colors " +
                (isActive
                  ? "bg-brand-100 text-brand"
                  : "bg-transparent text-ink hover:bg-surface-soft")
              }
            >
              <tab.Icon
                size={18}
                className={isActive ? "text-brand" : "text-ink"}
              />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
