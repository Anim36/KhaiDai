import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { AuthProviderShell } from "@/components/auth/AuthProviderShell";
import { CartProviderShell } from "@/components/providers/CartProviderShell";
import { DeliveryAddressProvider } from "@/contexts/DeliveryAddressContext";
import { DeliveryAddressModalHost } from "@/components/map/DeliveryAddressModalHost";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KhaiDai — Craving Deliciousness? Order Now!",
  description:
    "KhaiDai brings the best restaurants to your doorstep. Browse popular restaurants and trending dishes near you.",
};

/**
 * Viewport meta for proper mobile rendering.
 *
 * - width=device-width: match the CSS viewport to the device width
 *   (instead of the 980px desktop default).
 * - initial-scale=1: render at 1:1 so layouts sized in CSS pixels
 *   don't get zoomed in/out on first load.
 * - viewport-fit=cover: tell iOS Safari to expose the full screen
 *   including the notch / Dynamic Island area. We then use
 *   `env(safe-area-inset-*)` to keep content out of those bands.
 * - theme-color: matches the address bar on Android Chrome so the
 *   app feels native when wrapped in Capacitor.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff4d30",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="bg-white text-ink font-body antialiased">
        <AuthProviderShell>
          <LocaleProvider>
            <CartProviderShell>
              <DeliveryAddressProvider>
                {children}
                <DeliveryAddressModalHost />
              </DeliveryAddressProvider>
            </CartProviderShell>
          </LocaleProvider>
        </AuthProviderShell>
      </body>
    </html>
  );
}
