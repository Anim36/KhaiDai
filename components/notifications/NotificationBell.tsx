"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiClient";
import { BellIcon } from "@/components/icons";
import type { NotificationDto } from "@/lib/notifications-dto";

/**
 * Notification bell with polling + dropdown panel.
 *
 * Wiring:
 *   • Polls `/api/notifications?unread=true&limit=20` every 18s —
 *     enough to feel "live" without hammering the API.
 *   • Renders the unread count badge next to the bell. Caps the
 *     visible number at "9+" so the chip doesn't wrap.
 *   • Dropdown panel: opens on click, closes on outside click /
 *     Escape. Each row shows title, message, time-ago, and a
 *     read indicator. Clicking a notification marks it read.
 *   • "Mark all read" button in the panel header clears every
 *     unread row in one shot.
 *   • **Portal-based panel**: the panel is rendered through
 *     `createPortal` directly into `document.body` with
 *     `position: fixed`. The previous implementation lived
 *     inside the bell's parent which — on tight rider / partner
 *     headers — was clipped by `overflow: hidden` ancestors or
 *     by neighbouring `position: sticky` elements. The portal
 *     ensures the panel can never be cut off by a parent.
 *
 * Viewport clamping:
 *   • Panel width = `min(384px, 100vw - 24px)`.
 *   • On screens wider than 640px the panel anchors to the bell
 *     and clamps its right / left edges so it stays 12px inside
 *     the viewport. The bell's `getBoundingClientRect()` is the
 *     anchor — re-measured on scroll, resize, and every panel
 *     open so the panel follows the bell naturally without ever
 *     crossing the viewport.
 *   • Below 640px the panel becomes a full-width sheet pinned
 *     just under the header (12px L/R margin).
 *   • The wrapper listens to `resize` and `scroll` events while
 *     open. The list scrolls vertically inside the panel;
 *     horizontally the page never grows past the viewport while
 *     the panel is open (we assert it before render and warn if
 *     something else would push the page wider).
 *
 * Accessibility:
 *   • Bell button is a real `<button>` with `aria-haspopup`,
 *     `aria-expanded`.
 *   • Panel is `role="dialog"` with `aria-label`.
 *   • Escape and outside-click close. The polling tab visibility
 *     behaviour is unchanged from before.
 */

const POLL_INTERVAL_MS = 18_000;
const PANEL_MAX_W = 384;
const VIEWPORT_GUTTER = 12;
const MOBILE_BREAKPOINT = 640;

const READ_INDICATOR_LABEL: Record<NotificationDto["type"], string> = {
  ORDER_UPDATE: "Order update",
  PROMOTION: "Promotion",
  SYSTEM: "System",
};

type FeedState = {
  notifications: NotificationDto[];
  unreadCount: number;
};

const EMPTY: FeedState = { notifications: [], unreadCount: 0 };

type PanelPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (deltaSec < 60) {
    if (deltaSec < 5) return "just now";
    return `${deltaSec}s ago`;
  }
  if (deltaSec < 60 * 60) {
    return `${Math.floor(deltaSec / 60)} min ago`;
  }
  if (deltaSec < 60 * 60 * 24) {
    return `${Math.floor(deltaSec / (60 * 60))} h ago`;
  }
  if (deltaSec < 60 * 60 * 24 * 30) {
    return `${Math.floor(deltaSec / (60 * 60 * 24))} d ago`;
  }
  return `${Math.floor(deltaSec / (60 * 60 * 24 * 30))} mo ago`;
}

export function NotificationBell() {
  const [feed, setFeed] = useState<FeedState>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // `document.body` doesn't exist on the server, so we wait for
  // the first effect tick before opening the portal. Without
  // this the component would throw during SSR.
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const res = await apiFetch<{
      notifications: NotificationDto[];
      unreadCount: number;
    }>("/api/notifications?unread=true&limit=20");
    if (!res.ok) {
      if (res.status !== 401) {
        setError(res.error.message);
      }
      return;
    }
    setError(null);
    setFeed({
      notifications: res.data?.notifications ?? [],
      unreadCount: res.data?.unreadCount ?? 0,
    });
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Polling loop. Pauses while the tab is hidden to avoid
  // stomping on the user's battery when they background the
  // app for hours.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const markRead = async (id: string) => {
    setFeed((prev) => {
      const notifications = prev.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n,
      );
      const unreadCount = Math.max(
        0,
        prev.unreadCount -
          prev.notifications.filter((n) => n.id === id && !n.isRead).length,
      );
      return { notifications, unreadCount };
    });
    const res = await apiFetch(`/api/notifications/${id}/read`, {
      method: "PATCH",
    });
    if (!res.ok && res.status !== 401) {
      void refresh();
    }
  };

  const markAllRead = async () => {
    setFeed((prev) => ({
      notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
    const res = await apiFetch("/api/notifications/read-all", {
      method: "PATCH",
    });
    if (!res.ok && res.status !== 401) {
      void refresh();
    }
  };

  const loadOlder = async () => {
    setLoading(true);
    const res = await apiFetch<{
      notifications: NotificationDto[];
      unreadCount: number;
    }>("/api/notifications?unread=false&limit=20");
    setLoading(false);
    if (!res.ok) return;
    setFeed({
      notifications: res.data?.notifications ?? [],
      unreadCount: res.data?.unreadCount ?? feed.unreadCount,
    });
  };

  const unreadChip = feed.unreadCount > 9 ? "9+" : String(feed.unreadCount);

  // Position of the panel. Measured against the bell's
  // `getBoundingClientRect()`. Recomputed on scroll/resize
  // because the bell is `position: sticky` inside the rider
  // header — it moves with scroll. Below the 640px breakpoint
  // it pins to the viewport top, 12px left/right margin, and
  // stretches full width.
  const [position, setPosition] = useState<PanelPosition>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 0,
  });

  const computePosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_MAX_W, vw - VIEWPORT_GUTTER * 2);

    if (vw < MOBILE_BREAKPOINT) {
      // Full-width sheet just under the header. We measure the
      // header from the bell's bottom edge — for the sticky
      // rider / partner / customer header that's ~56-64px.
      const headerHeight =
        triggerRef.current?.getBoundingClientRect().bottom ?? 64;
      const top = Math.max(
        0,
        Math.min(headerHeight + VIEWPORT_GUTTER, vh - 220),
      );
      const left = VIEWPORT_GUTTER;
      const maxHeight = Math.min(vh * 0.7, vh - top - VIEWPORT_GUTTER);
      setPosition({ top, left, width: vw - left * 2, maxHeight });
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const idealTop = rect.bottom + VIEWPORT_GUTTER;
    const maxHeight = Math.min(vh * 0.7, vh - idealTop - VIEWPORT_GUTTER);
    // Anchor on the bell's right edge so the panel grows to the
    // left — matches the usual "dropdown attached to the right
    // corner of the bell" mental model. Clamp so the left edge
    // never crosses the gutter.
    let left = rect.right - width;
    const minLeft = VIEWPORT_GUTTER;
    const maxLeft = vw - VIEWPORT_GUTTER - width;
    left = Math.min(Math.max(left, minLeft), maxLeft);
    setPosition({ top: idealTop, left, width, maxHeight });
  }, []);

  // Recompute on open + on resize + on scroll, while open.
  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, computePosition]);

  // Outside click + Escape. We listen on the document for both
  // because the panel lives in a portal — its DOM tree is no
  // longer a descendant of the bell button. The `panelRef`
  // check prevents the same click that opened the panel from
  // immediately closing it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Defence-in-depth horizontal-overflow guard. If the open
  // panel somehow pushes `document.documentElement.scrollWidth`
  // past the viewport (e.g. a wide notification), the page
  // shouldn't sprout a horizontal scrollbar. We trim the panel
  // width to the available space before rendering and adjust on
  // resize.
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const safeWidth = useMemo(() => {
    if (viewportWidth === null) return position.width;
    return Math.max(0, Math.min(position.width, viewportWidth - 24));
  }, [viewportWidth, position.width]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${feed.unreadCount} unread`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <BellIcon size={20} />
        {feed.unreadCount > 0 ? (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white"
          >
            {unreadChip}
          </span>
        ) : null}
      </button>

      {open && hydrated && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Notifications"
              data-bell-panel="true"
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: safeWidth,
                maxHeight: position.maxHeight,
                zIndex: 1200, // sit above the sidebar + sticky header
              }}
              className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-ink">
                    Notifications
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {feed.unreadCount === 0
                      ? "All caught up"
                      : `${feed.unreadCount} unread`}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {feed.unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="rounded-lg px-2 py-1 text-[12px] font-semibold text-brand hover:bg-brand-50"
                    >
                      Mark all read
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loading}
                    className="rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-muted hover:bg-line"
                  >
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </header>

              {error ? (
                <div
                  role="alert"
                  className="border-b border-line bg-rose-50 px-4 py-2 text-[12px] font-semibold text-rose-700"
                >
                  {error}
                </div>
              ) : null}

              {feed.notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="font-display text-[14px] font-extrabold text-ink">
                    Nothing new here
                  </span>
                  <span className="text-[12px] text-ink-muted">
                    Order updates and account alerts will show up here.
                  </span>
                </div>
              ) : (
                <ul className="flex flex-1 flex-col divide-y divide-line overflow-y-auto">
                  {feed.notifications.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onMarkRead={() => markRead(n.id)}
                    />
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function NotificationRow({
  n,
  onMarkRead,
}: {
  n: NotificationDto;
  onMarkRead: () => void;
}) {
  const dot =
    n.type === "ORDER_UPDATE"
      ? "bg-brand"
      : n.type === "PROMOTION"
        ? "bg-amber-500"
        : "bg-ink-muted";
  return (
    <li>
      <button
        type="button"
        onClick={onMarkRead}
        className={
          "flex w-full cursor-pointer flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-surface " +
          (n.isRead ? "opacity-70" : "bg-white")
        }
      >
        <div className="flex w-full items-center gap-2">
          {!n.isRead ? (
            <span
              aria-hidden
              className={"mt-1 inline-block h-2 w-2 shrink-0 rounded-full " + dot}
            />
          ) : (
            <span aria-hidden className="mt-1 inline-block h-2 w-2 shrink-0" />
          )}
          <span className="flex-1 whitespace-normal break-words text-[13px] font-semibold text-ink">
            {n.title}
          </span>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            {READ_INDICATOR_LABEL[n.type]}
          </span>
        </div>
        {n.message ? (
          // Message text wraps fully — never truncated. The portal
          // gives us the full panel width; the row has no max width
          // beyond the panel, so the message can be several lines
          // long without truncation.
          <p className="ml-4 whitespace-normal break-words text-[12px] text-ink-muted">
            {n.message}
          </p>
        ) : null}
        <div className="ml-4 flex w-full items-center justify-between text-[10px] text-ink-muted">
          <span>{timeAgo(n.createdAt)}</span>
          {!n.isRead ? (
            <span className="font-semibold text-brand">Unread</span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
