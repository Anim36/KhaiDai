"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

/**
 * Feat 2 — chat panel for the rider ↔ customer thread. Renders
 * inside a drawer so it doesn't disrupt the tracking / delivery
 * layout. Polls every 6s while open; clears the poll on close.
 *
 * The status gate is enforced server-side (this component just
 * surfaces what the API returned and disables the input when
 * `chatEnabled` is false). The "Chat will be available once the
 * rider picks up your order" placeholder copy sits on top of the
 * list view so users always see *why* they can't talk yet.
 */
type WireMessage = {
  id: string;
  senderId: string;
  senderRole: "CUSTOMER" | "RIDER";
  message: string;
  createdAt: string;
};

const POLL_INTERVAL_MS = 6000;

export function OrderChatPanel({
  orderId,
  currentUserId,
  currentRole,
  otherPartyName,
}: {
  orderId: string;
  currentUserId: string;
  /** UI side. The server is what enforces role-based read access. */
  currentRole: "CUSTOMER" | "RIDER";
  otherPartyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<WireMessage[]>([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    const res = await apiFetch<{
      messages?: WireMessage[];
      chatEnabled?: boolean;
    }>(`/api/orders/${orderId}/messages`);
    if (cancelledRef.current) return;
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setError(null);
    setMessages(res.data?.messages ?? []);
    setChatEnabled(Boolean(res.data?.chatEnabled));
  }, [orderId]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!open) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    const timerRef: { current: number | null } = { current: null };
    timerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      cancelledRef.current = true;
    };
  }, [open, load]);

  useEffect(() => {
    // Scroll to the bottom whenever a new message lands so the
    // user sees their message land in real-time.
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, open]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !chatEnabled || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ message: WireMessage }>(
        `/api/orders/${orderId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message: text }),
        },
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setDraft("");
      // Optimistically add the message; the next poll will dedupe
      // because every row has a stable id.
      if (res.data?.message) {
        setMessages((prev) => [...prev, res.data!.message]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
      >
        <ChatIcon size={16} />
        Chat
      </button>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ChatIcon size={16} />
          <h3 className="font-display text-[14px] font-bold text-ink">
            Chat with {otherPartyName}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-ink-muted hover:bg-surface"
          aria-label="Close chat"
        >
          <CloseIcon size={16} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex max-h-80 min-h-[180px] flex-col gap-2 overflow-y-auto px-4 py-3"
      >
        {loading ? (
          <p className="text-[12px] text-ink-muted">Loading…</p>
        ) : !chatEnabled ? (
          <p className="rounded-xl bg-amber-50 px-3 py-3 text-[13px] text-amber-800">
            Chat will be available once the rider picks up your order.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            No messages yet — say hi!
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                className={
                  "flex flex-col " + (mine ? "items-end" : "items-start")
                }
              >
                <span
                  className={
                    "inline-block max-w-[80%] rounded-2xl px-3 py-2 text-[13px] " +
                    (mine
                      ? "bg-brand text-white"
                      : "bg-surface text-ink")
                  }
                >
                  {m.message}
                </span>
                <span className="mt-0.5 text-[10px] text-ink-muted">
                  {mine ? "You" : m.senderRole === "RIDER" ? "Rider" : "Customer"}
                  {" · "}
                  {new Date(m.createdAt).toLocaleTimeString()}
                </span>
              </div>
            );
          })
        )}
        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-line px-3 py-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={chatEnabled ? "Type a message…" : "Chat locked"}
          disabled={!chatEnabled || sending}
          className="h-9 flex-1 rounded-xl border border-line bg-surface px-3 text-[13px] focus:border-brand focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!chatEnabled || sending || draft.trim().length === 0}
          className="inline-flex h-9 items-center rounded-xl bg-brand px-4 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {/* Tiny visual hint of role so the layout is symmetric */}
      <p className="px-4 pb-2 text-[10px] text-ink-muted">
        Signed in as {currentRole === "RIDER" ? "Rider" : "Customer"}
      </p>
    </div>
  );
}

function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 4.5C2 3.4 2.9 2.5 4 2.5h12c1.1 0 2 0.9 2 2v7c0 1.1-0.9 2-2 2h-9l-4 3v-3H4c-1.1 0-2-0.9-2-2v-7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}