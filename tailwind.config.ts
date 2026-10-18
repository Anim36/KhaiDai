import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    // Custom screen `xs` for narrow phones (320–414px). Default
    // Tailwind screens stay untouched:
    //   sm:  640
    //   md:  768
    //   lg: 1024
    //   xl: 1280
    //   2xl: 1536
    screens: {
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: "#ff4d30",
          50: "#fff4f2",
          100: "#ffebe8",
          200: "#fff9e6",
          yellow: "#ffb84d",
          accent: "#ff9500",
        },
        ink: {
          DEFAULT: "#111827",
          muted: "#6b7280",
        },
        line: "#e5e7eb",
        surface: {
          page: "#f9fafb",
          soft: "#f3f4f6",
          rating: "#fef3c7",
        },
      },
      fontFamily: {
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
        body: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        pill: "9999px",
        card: "24px",
        tile: "16px",
      },
      maxWidth: {
        page: "1280px",
      },
    },
  },
  plugins: [],
};
export default config;
