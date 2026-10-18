"use client";

import { useState } from "react";
import { Footer } from "@/components/home/Footer";
import { TopNav } from "@/components/home/TopNav";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { ResponsiveSidebarShell } from "@/components/layout/ResponsiveSidebarShell";
import { ProfileSidebar, type ProfileTabId } from "./ProfileSidebar";
import {
  AddressesPanel,
  FavoritesPanel,
  OrdersPanel,
  PaymentPanel,
  SettingsPanel,
} from "./ProfilePanels";
import { WalletPanel } from "./WalletPanel";
import { ReferAndEarnPanel } from "./ReferAndEarnPanel";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { TranslationKey } from "@/lib/i18n/LocaleProvider";

/**
 * Tab → user-facing label key. Used in the mobile top-bar so the
 * customer always knows which section they're looking at without
 * having to open the drawer.
 */
const SECTION_LABEL_KEY: Record<ProfileTabId, TranslationKey> = {
  orders: "profile.sidebar.myOrders",
  addresses: "profile.sidebar.deliveryAddresses",
  payment: "profile.sidebar.paymentMethods",
  wallet: "profile.sidebar.myWallet",
  refer: "profile.sidebar.referEarn",
  favorites: "profile.sidebar.myFavorites",
  settings: "profile.sidebar.accountSettings",
};

/**
 * Client orchestrator for `/profile`.
 *
 *   • Desktop (lg+): left sidebar in a 260px column, content to the
 *     right. Identical to the previous layout.
 *   • Mobile (< lg): the sidebar is hidden. The page shows a sticky
 *     top bar with a hamburger button, the current section name, and
 *     a small user avatar. Tapping the hamburger opens the sidebar
 *     as a slide-in drawer with backdrop, body-scroll lock, Escape /
 *     outside-click / route-change close.
 *
 * The sidebar content (user info + menu items + active highlight) is
 * shared between the desktop column and the drawer — the same React
 * element is mounted in both places via ResponsiveSidebarShell, so a
 * state change (e.g. avatar loaded later) reflects in both.
 */
export function CustomerProfilePage() {
  const [tab, setTab] = useState<ProfileTabId>("orders");
  // Drawer open state is owned here so the hamburger button can
  // live inside the TopNav brand row (the user sees one
  // sticky header with the hamburger on the left, brand to its
  // right, then search + lang + cart + avatar). The shell's
  // own mobile topbar is hidden via `hideMobileTopBar` so we
  // don't render two h-56 strips stacked on top of each other.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = useT();
  const { user } = useAuth();
  const { avatar } = useUserAvatar(user?.id);

  const sectionLabel = t(SECTION_LABEL_KEY[tab]);

  const sidebar = (
    <ProfileSidebar
      active={tab}
      onSelect={(next) => {
        // Drawer stays open until the user closes it (or navigates),
        // so just reflect the new active tab here. The shared shell
        // closes the drawer when a link inside is clicked — this
        // helper is called for tab buttons that aren't anchors, so
        // we don't need to also close here.
        setTab(next);
      }}
    />
  );

  return (
    <RequireAuth role="CUSTOMER">
      {/* Same wrap as <HomePage />: a full-width <main> so the
          <Footer /> below stretches the full viewport instead of
          being trapped inside the sidebar column on desktop
          (lg+). Earlier the Footer was the last child of the
          sidebar shell's right column, which constrained its
          width to ~70% of the viewport and made the dark
          background stop halfway across the page on desktop. */}
      <main className="min-h-screen w-full bg-white">
        {/* Real <TopNav /> on every viewport — same chrome the
            homepage / restaurant / cart pages already use, so the
            mobile experience is consistent and the user can still
            search, switch language, see cart count, etc. from
            /profile. `compactOnMobile` hides the location pill +
            inline search bar on phones and surfaces a search-icon
            button in the brand row that opens a full-screen search
            overlay — saves ~110 px of vertical space on a page
            that doesn't need the inline hero search UI.
            `hamburger` mounts a hamburger button on the left of
            the brand row on mobile — it drives the shell's
            controlled drawer state. */}
        <TopNav
          compactOnMobile
          hamburger={{
            open: drawerOpen,
            onClick: () => setDrawerOpen(true),
            label: t("profile.drawerLabel"),
          }}
        />

        <ResponsiveSidebarShell
          sidebar={sidebar}
          drawerLabel={t("profile.drawerLabel")}
          hideMobileTopBar
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
        >
          {/* Page body — the ResponsiveSidebarShell renders the
              sidebar in BOTH the desktop column (lg+) and the mobile
              drawer (<lg), so the page only needs to render the
              active content panel here. */}
          <div className="flex min-w-0 flex-1 flex-col">

            <section className="flex w-full flex-1 flex-col gap-6 px-4 pb-12 pt-6 md:px-[64px] md:pt-16">
              <h1 className="font-display text-[28px] font-extrabold leading-tight text-ink md:text-[34px]">
                {sectionLabel}
              </h1>
              <div className="flex min-w-0 flex-1 flex-col">
                {tab === "orders" && <OrdersPanel />}
                {tab === "addresses" && <AddressesPanel />}
                {tab === "payment" && <PaymentPanel />}
                {/* Feat 3+4 — KhaiDai Wallet (balance + tokens + history). */}
                {tab === "wallet" && <WalletPanel />}
                {/* Feat 6 — Customer Referral Program. */}
                {tab === "refer" && <ReferAndEarnPanel />}
                {tab === "favorites" && <FavoritesPanel />}
                {tab === "settings" && <SettingsPanel />}
              </div>
            </section>
          </div>
        </ResponsiveSidebarShell>

        {/* Sibling of the shell so it spans the full viewport
            width on every breakpoint — same as the homepage. */}
        <Footer />
      </main>
    </RequireAuth>
  );
}