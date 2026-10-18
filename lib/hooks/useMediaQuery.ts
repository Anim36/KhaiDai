"use client";

/**
 * SSR-safe `matchMedia` hook.
 *
 * Why this exists:
 *   1. Reading `window.matchMedia` during server rendering throws.
 *      So we return a deterministic initial value on the server
 *      (configurable — default `false` to match the "small screen"
 *      branch, since most user states are mobile-first).
 *   2. Without `useLayoutEffect` on the server we still get the
 *      initial value on first paint (matches SSR HTML).
 *   3. The listener is added lazily inside `useEffect` so it never
 *      runs on the server.
 *   4. The component should ALSO render the right thing without the
 *      hook when the layout is purely CSS-driven (Tailwind
 *      `md:hidden` etc). This hook is for cases where you actually
 *      need a JS-level branch — e.g. conditionally enabling a body
 *      scroll lock, picking a chart height, or deciding whether to
 *      mount a heavy component on mobile.
 *
 *   // Don't do this:
 *   const isMobile = useMediaQuery("(max-width: 767px)");
 *   return <div className={isMobile ? "block" : "hidden"}>…</div>;
 *
 *   // Do this instead:
 *   return <div className="block md:hidden">…</div>;
 *
 *   Use this hook ONLY when CSS can't solve the problem.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(
  query: string,
  /** Value returned during SSR and the first client render. */
  fallback: boolean = false,
): boolean {
  const [matches, setMatches] = useState<boolean>(fallback);

  useEffect(() => {
    // Guard for older browsers (and the SSR hydration step that
    // re-runs without a `window`).
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    // Sync to the *actual* state on mount in case the breakpoint
    // changed between the SSR snapshot and the first effect.
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // `addEventListener` is the modern API; `addListener` is the
    // pre-2018 fallback (Safari < 14). Both are kept for safety.
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } else {
      // Legacy Safari < 14 falls back to the deprecated
      // `addListener` / `removeListener` API. The `as never` cast
      // is intentional: TypeScript's lib.dom.d.ts does not declare
      // these methods on `MediaQueryList`, but they exist at
      // runtime in old Safari.
      (mql as never as { addListener: (l: (e: MediaQueryListEvent) => void) => void }).addListener(onChange);
      return () => {
        (mql as never as { removeListener: (l: (e: MediaQueryListEvent) => void) => void }).removeListener(onChange);
      };
    }
  }, [query]);

  return matches;
}

// Convenient pre-canned breakpoints that match the Tailwind config
// (see `tailwind.config.ts` `screens`).
export const BP = {
  xs: "(min-width: 400px)",
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
  mobile: "(max-width: 767px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  desktop: "(min-width: 1024px)",
  // True on devices that support hover (i.e. has a pointer — desktop
  // browsers). Useful for showing hover-only affordances.
  hover: "(hover: hover)",
  // True when the viewport is taller than wide (portrait phones).
  portrait: "(orientation: portrait)",
} as const;
