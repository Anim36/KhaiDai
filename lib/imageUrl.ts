/**
 * Resolve a database-stored image value into a CSS-friendly URL.
 *
 * `Restaurant.coverImage` and `MenuItem.image` may now hold *any* of:
 *
 *   • a data URI like `data:image/png;base64,iVBORw…`  (partner upload)
 *   • a fully-rooted public path like `/assets/dish-1.png`
 *   • an absolute URL like `https://cdn.example.com/x.jpg`
 *   • a bare filename like `dish-1.png`  (legacy seeded data)
 *   • `null` / `""`  (no image set)
 *
 * Earlier rendering code blindly prepended `/assets/` to whatever it
 * got, which produced broken paths like `/assets/data:image/png;base64,…`
 * and triggered a flood of 404s in the dev-server log. This helper
 * is the single source of truth: callers feed it the raw value and
 * receive a URL that can go straight into `style={{ backgroundImage: … }}`
 * or `<img src=…>`.
 *
 * Rules:
 *   • null / empty              → fallback.
 *   • starts with `data:`       → return as-is (the browser renders it directly).
 *   • starts with `/`, `http://`, `https://` → already absolute, return as-is.
 *   • anything else             → prepend `/assets/` (legacy bare filename).
 *
 * The fallback defaults to a neutral demo image; pass `null` to
 * receive `null` when there's no image (callers can then render a
 * placeholder element).
 */
export function resolveImageUrl(
  value: string | null | undefined,
  fallback = "/assets/dish-1.png",
): string | null {
  if (!value) return fallback ?? null;
  const v = value.trim();
  if (!v) return fallback ?? null;
  if (
    v.startsWith("data:") ||
    v.startsWith("/") ||
    v.startsWith("http://") ||
    v.startsWith("https://")
  ) {
    return v;
  }
  // Backwards-compatible: bare filenames still get the /assets/ prefix.
  return `/assets/${v}`;
}
