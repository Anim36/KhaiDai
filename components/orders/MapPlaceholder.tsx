/**
 * Stylised SVG "map" used in the absence of a real Google Maps / Mapbox
 * integration. It draws:
 *   - a soft pastel grid as the city background
 *   - a winding brand-colour polyline for the route
 *   - two pins: restaurant (start) and delivery address (end)
 *   - a glowing dot for the rider, positioned roughly 70% along the path
 *
 * The viewBox is fixed so the layout stays consistent regardless of
 * container width; the wrapper uses `preserveAspectRatio="xMidYMid meet"`
 * to scale gracefully up to tablet widths.
 */
export function MapPlaceholder({
  restaurantName,
  destinationLabel,
  riderOnTheWay,
}: {
  restaurantName: string;
  destinationLabel: string;
  /** Toggles the rider dot — only relevant before pickup / after delivery. */
  riderOnTheWay: boolean;
}) {
  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-[24px] border border-line bg-surface-soft">
      <svg
        viewBox="0 0 800 400"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label="Live order route map"
      >
        <defs>
          <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
          <linearGradient id="route-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff4d30" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff4d30" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="rider-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4d30" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ff4d30" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* City grid */}
        <rect width="800" height="400" fill="#f9fafb" />
        <rect width="800" height="400" fill="url(#map-grid)" />

        {/* Faux river / road shapes for visual texture */}
        <path
          d="M-20 110 C 180 60, 360 200, 520 140 S 820 80, 820 80"
          stroke="#dbeafe"
          strokeWidth="32"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M-20 110 C 180 60, 360 200, 520 140 S 820 80, 820 80"
          stroke="#bfdbfe"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        <path
          d="M120 340 C 200 280, 280 360, 380 300 S 560 220, 680 260"
          stroke="#e5e7eb"
          strokeWidth="22"
          fill="none"
          strokeLinecap="round"
        />

        {/* Route (solid red, dashed on top to suggest motion) */}
        <path
          d="M150 260 C 240 200, 320 320, 420 250 S 580 180, 660 220"
          stroke="url(#route-gradient)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M150 260 C 240 200, 320 320, 420 250 S 580 180, 660 220"
          stroke="#ff4d30"
          strokeWidth="2"
          strokeDasharray="8 8"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Restaurant pin (start) */}
        <g transform="translate(150 260)">
          <circle r="18" fill="#fff4f2" />
          <path
            d="M0 -10 C -7 -10, -12 -5, -12 1 C -12 9, 0 18, 0 18 C 0 18, 12 9, 12 1 C 12 -5, 7 -10, 0 -10 Z"
            fill="#ff4d30"
          />
          <circle cy="1" r="4" fill="#ffffff" />
        </g>

        {/* Delivery pin (end) */}
        <g transform="translate(660 220)">
          <circle r="18" fill="#fff4f2" />
          <path
            d="M0 -10 C -7 -10, -12 -5, -12 1 C -12 9, 0 18, 0 18 C 0 18, 12 9, 12 1 C 12 -5, 7 -10, 0 -10 Z"
            fill="#111827"
          />
          <circle cy="1" r="4" fill="#ffffff" />
        </g>

        {/* Rider dot (positioned ~70% along the curve) */}
        {riderOnTheWay && (
          <g transform="translate(560 220)">
            <circle r="36" fill="url(#rider-glow)" />
            <circle r="12" fill="#ffffff" />
            <circle r="7" fill="#ff4d30" />
          </g>
        )}
      </svg>

      {/* Floating labels on top of the SVG */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-[55%] rounded-2xl bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          From
        </p>
        <p className="truncate font-display text-[13px] font-bold text-ink">
          {restaurantName}
        </p>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 max-w-[55%] rounded-2xl bg-white/95 px-3 py-2 text-right shadow-sm backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          To
        </p>
        <p className="truncate font-display text-[13px] font-bold text-ink">
          {destinationLabel}
        </p>
      </div>
    </div>
  );
}
