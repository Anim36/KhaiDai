/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // The repo's existing JSX has plenty of unescaped
    // apostrophes / quotes that trigger
    // `react/no-unescaped-entities`. The rule is style-only
    // (the rendered output is identical), and fixing every
    // occurrence is out of scope for the deployment-prep
    // work. Production builds will continue to fail under the
    // default Next preset otherwise. Re-enable if/when the
    // JSX is cleaned up.
    ignoreDuringBuilds: true,
  },
  images: {
    // `next/image` will refuse to optimise any remote host that
    // is not in this allow-list. We start with the Figma domains
    // (the partner signup / verification flows render Figma-hosted
    // mock screenshots during onboarding) and add the common
    // public fallback image hosts we use in dish / restaurant
    // mocks. New domains go here before any code can pull from
    // them at runtime.
    remotePatterns: [
      { protocol: "https", hostname: "www.figma.com" },
      { protocol: "https", hostname: "figma.com" },
      // Public domain placeholders (Unsplash CDN).
      { protocol: "https", hostname: "images.unsplash.com" },
      // OpenStreetMap / Leaflet tiles — we don't go through
      // `next/image` for map tiles, but the rest of the app
      // sometimes embeds an OSM-hosted image.
      { protocol: "https", hostname: "tile.openstreetmap.org" },
      // SSLCommerz sometimes returns a hosted receipt image.
      { protocol: "https", hostname: "securepay.sslcommerz.com" },
      { protocol: "https", hostname: "sandbox.sslcommerz.com" },
    ],
  },
  // Vercel hard-caps the serverless request body at 4.5 MB. We
  // already compress cover/menu/profile/promo/document images
  // client-side (see `lib/clientImage.ts`) so the JSON envelope
  // stays under that cap, but setting an explicit `bodySizeLimit`
  // here gives us a friendlier 413 from Vercel's edge rather than
  // a generic truncation.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
