import { StarIcon } from "@/components/icons";

/**
 * Minimal rider shape the tracking page actually needs. Kept loose
 * (no rating / vehicle / delivery count required) because the order
 * API only ships name + phone today. Optional fields stay optional
 * so the card degrades gracefully if the rider row grows new fields
 * later.
 */
export type RiderFromOrder = {
  id: string;
  name: string;
  phone: string | null;
  rating?: number | null;
  deliveries?: number | null;
  vehicle?: "bike" | "scooter" | "bicycle" | "car" | null;
};

/**
 * Inline icons that aren't in the shared icon set. Kept here as tiny
 * functional components rather than added to `components/icons` because
 * they're only used on the order-tracking screen.
 */
function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 4.5C5 3.67 5.67 3 6.5 3H8.7C9.18 3 9.6 3.32 9.74 3.78L10.95 7.79C11.07 8.18 10.94 8.6 10.63 8.85L8.97 10.21C10.1 12.52 11.98 14.4 14.29 15.53L15.65 13.87C15.9 13.56 16.32 13.43 16.71 13.55L20.72 14.76C21.18 14.9 21.5 15.32 21.5 15.8V18C21.5 18.83 20.83 19.5 20 19.5H18C11.1 19.5 5 13.4 5 6.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 5.5C4 4.67 4.67 4 5.5 4H18.5C19.33 4 20 4.67 20 5.5V14.5C20 15.33 19.33 16 18.5 16H9L5 19.5V16H5.5C4.67 16 4 15.33 4 14.5V5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VehicleIcon({
  kind,
  size = 18,
}: {
  kind: NonNullable<RiderFromOrder["vehicle"]> | null | undefined;
  size?: number;
}) {
  if (kind === "scooter" || kind === "bicycle") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9 17H15M15 17L17 7H10M10 7L7 4H5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 12H7L9 7H17L19 12H21M9 17H15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Two-letter initials derived from the rider's display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return (parts.map((p) => p[0] ?? "").join("") || "R").toUpperCase();
}

/**
 * Compact rider summary card with avatar, name, rating, vehicle, and
 * call/chat actions. `tel:` / `sms:` schemes use the rider's phone
 * (if known) so the buttons work on mobile. When phone is missing
 * we still render the card but hide the buttons.
 */
export function RiderCard({ rider }: { rider: RiderFromOrder }) {
  const phoneClean = rider.phone?.replace(/[^\d+]/g, "") ?? null;

  // Defensive numeric fallbacks — the API only guarantees id/name/phone.
  const rating = typeof rider.rating === "number" ? rider.rating : null;
  const deliveries =
    typeof rider.deliveries === "number" ? rider.deliveries : null;
  const vehicleLabel =
    rider.vehicle === "bike"
      ? "Bike"
      : rider.vehicle === "bicycle"
        ? "Bicycle"
        : rider.vehicle === "car"
          ? "Car"
          : rider.vehicle === "scooter"
            ? "Scooter"
            : "Rider";

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-lg font-extrabold text-brand">
          {initialsOf(rider.name)}
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-2 ring-white">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1 min-w-px">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-display text-[16px] font-bold text-ink">
              {rider.name}
            </p>
            {rating !== null ? (
              <span className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-ink">
                <StarIcon size={12} className="text-brand-accent" />
                {rating.toFixed(1)}
              </span>
            ) : null}
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <VehicleIcon kind={rider.vehicle} size={14} />
            {vehicleLabel}
            {deliveries !== null
              ? ` · ${deliveries.toLocaleString()} deliveries`
              : ""}
          </p>
        </div>
      </div>

      {phoneClean ? (
        <div className="grid grid-cols-2 gap-3">
          <a
            href={`tel:${phoneClean}`}
            aria-label={`Call ${rider.name}`}
            className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-bold text-ink transition-colors hover:border-brand hover:text-brand"
          >
            <PhoneIcon />
            Call
          </a>
          <a
            href={`sms:${phoneClean}`}
            aria-label={`Chat with ${rider.name}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <ChatIcon />
            Chat
          </a>
        </div>
      ) : (
        <p className="rounded-xl bg-surface px-3 py-2 text-[12px] text-ink-muted">
          Phone number not available for this rider.
        </p>
      )}
    </div>
  );
}
