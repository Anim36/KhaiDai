"use client";

import {
  CheckIcon,
  ChatIcon,
  MapPinIcon,
  PhoneIcon,
} from "@/components/icons";
import type { DeliveryRequest, OrderLine } from "@/data/rider-dashboard";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Order-details panel rendered on the right / bottom of the
 * active-delivery page.
 *
 *   • Restaurant block — name + address + Call button
 *     (uses `restaurantPhone`).
 *   • Customer block   — name + address + Call + Message buttons
 *     (use `customerPhone`).
 *   • Items list       — per-line breakdown (qty + name), falls back
 *     to the `itemSummary` string when the enriched list isn't
 *     present.
 *
 * Contact actions are placeholder-only — they `alert()` (or no-op)
 * so the rider can see they wire up without launching a real
 * tel: or sms: protocol handler (which would block on mobile).
 */
export function DeliveryStatusPanel({ request }: { request: DeliveryRequest }) {
  const t = useT();
  return (
    <aside
      data-panel="order-details"
      className="flex flex-col gap-6 rounded-2xl border border-line bg-white p-6"
    >
      {/* Restaurant */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{t("rider.dashboard.panel.pickup")}</SectionLabel>
        <StopRow
          tone="brand"
          title={request.pickupName}
          subtitle={request.pickupAddress}
        />
        {request.restaurantPhone ? (
          <ContactActions
            phone={request.restaurantPhone}
            target="restaurant"
            t={t}
          />
        ) : null}
      </section>

      <Divider />

      {/* Customer */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{t("rider.dashboard.panel.dropoff")}</SectionLabel>
        <StopRow
          tone="amber"
          title={request.dropoffName}
          subtitle={request.dropoffAddress}
        />
        {request.customerPhone ? (
          <ContactActions
            phone={request.customerPhone}
            target="customer"
            t={t}
          />
        ) : null}
        {/* Feat 2 — customer's delivery instruction. Surfaces
            right under the drop-off info so the rider reads it
            before knocking on the door. */}
        {request.specialInstructions ? (
          <div
            role="note"
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900"
          >
            <span className="block text-[11px] font-bold uppercase tracking-wide text-amber-700">
              {t("rider.dashboard.panel.customerNote")}
            </span>
            <p className="mt-0.5 text-[13px] leading-snug">
              {request.specialInstructions}
            </p>
          </div>
        ) : null}
      </section>

      <Divider />

      {/* Order items */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{t("rider.dashboard.panel.orderItems")}</SectionLabel>
        {request.items && request.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {request.items.map((line, idx) => (
              <ItemRow
                key={`${request.id}-item-${idx}`}
                line={line}
              />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-muted">{request.itemSummary}</p>
        )}
      </section>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="h-px w-full bg-line" aria-hidden />;
}

function StopRow({
  tone,
  title,
  subtitle,
}: {
  tone: "brand" | "amber";
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
          (tone === "brand"
            ? "bg-[#fff5f3] text-brand"
            : "bg-[#fff7e6] text-[#f59e0b]")
        }
        aria-hidden
      >
        <MapPinIcon size={18} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ink truncate">
          {title}
        </span>
        <span className="text-[13px] text-ink-muted truncate">{subtitle}</span>
      </div>
    </div>
  );
}

function ItemRow({ line }: { line: OrderLine }) {
  return (
    <li
      data-item-row
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2"
    >
      <span className="flex items-center gap-3 text-[13px] font-medium text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#fff5f3] text-[12px] font-bold text-brand">
          ×{line.qty}
        </span>
        <span>{line.name}</span>
      </span>
      <span className="text-[12px] font-semibold text-ink-muted">
        <CheckIcon size={14} />
      </span>
    </li>
  );
}

/**
 * Call + Message buttons next to a phone number. The icons are the
 * shared `PhoneIcon` / `ChatIcon`; the buttons are real anchors
 * with `tel:` / `sms:` hrefs so on a real device they'd launch the
 * dialer / messenger. On desktop they `alert()` so the rider can
 * still see the action fire in a demo.
 */
function ContactActions({
  phone,
  target,
  t,
}: {
  phone: string;
  target: "restaurant" | "customer";
  t: ReturnType<typeof useT>;
}) {
  const onDesktopNoop = (e: React.MouseEvent) => {
    if (typeof window !== "undefined" && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      window.alert(
        target === "restaurant"
          ? t("rider.dashboard.panel.callRestaurant", { phone })
          : t("rider.dashboard.panel.callCustomer", { phone }),
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`tel:${phone.replace(/\s|-/g, "")}`}
        onClick={onDesktopNoop}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        <PhoneIcon size={16} />
        {t("rider.dashboard.panel.call")}
      </a>
      <a
        href={`sms:${phone.replace(/\s|-/g, "")}`}
        onClick={onDesktopNoop}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
      >
        <ChatIcon size={16} />
        {t("rider.dashboard.panel.message")}
      </a>
      <span className="text-[12px] font-normal text-ink-muted">{phone}</span>
    </div>
  );
}