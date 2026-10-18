"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AdminShell } from "@/components/admin/dashboard/AdminShell";
import { apiFetch } from "@/lib/apiClient";

/**
 * Feat 3 — /admin/messages. Surfaces inbound contact-form
 * submissions. Unread rows are sorted to the top so the admin's
 * attention goes to fresh inquiries first; clicking a row marks
 * it read (PATCH /api/admin/messages/[id]) and reveals the full
 * message body inline.
 */
type MessageRow = {
  id: string;
  name: string;
  email: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export function AdminMessagesPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminShell activeKey="messages">
        {/* Bug 2 — outer `p-8` wrapper matches the Dashboard. */}
        <div className="flex flex-1 flex-col gap-6 p-8">
          <PageHeader />
          <MessagesContent />
        </div>
      </AdminShell>
    </RequireAuth>
  );
}

function PageHeader() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-[24px] font-extrabold text-ink md:text-[28px]">
        Contact messages
      </h1>
      <p className="text-[13px] text-ink-muted">
        Inbound messages from the public /contact form. Unread rows
        appear first.
      </p>
    </header>
  );
}

function MessagesContent() {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        messages?: MessageRow[];
        unreadCount?: number;
      }>("/api/admin/messages");
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setError(null);
      const msgs = res.data?.messages ?? [];
      setRows(msgs);
      setUnreadCount(res.data?.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const handleOpen = useCallback(
    async (id: string) => {
      setSelectedId(id);
      // Optimistic read state so the badge updates immediately.
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isRead: true } : r)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await apiFetch(`/api/admin/messages/${id}`, {
          method: "PATCH",
        });
        if (!res.ok) {
          // Roll back the optimistic update on failure.
          setRows((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, isRead: false } : r,
            ),
          );
          setUnreadCount((c) => c + 1);
        }
      } catch {
        // Network error — leave the optimistic state in place; the
        // next 30s poll will reconcile.
      }
    },
    [],
  );

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  // Sort: unread first, then newest
  const sorted = [...rows].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.6fr]">
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-[14px] font-bold text-ink">
            {loading ? "Loading…" : `${rows.length} message${rows.length === 1 ? "" : "s"}`}
          </h2>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        </header>
        {error ? (
          <p className="px-4 py-3 text-[12px] text-rose-600">{error}</p>
        ) : sorted.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
            No messages yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {sorted.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(m.id)}
                  aria-current={m.id === selectedId ? "true" : undefined}
                  className={
                    "flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface " +
                    (m.id === selectedId
                      ? "bg-[#fff5f3]"
                      : "bg-white")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[13px] font-bold text-ink">
                      {m.name}
                    </span>
                    {!m.isRead ? (
                      <span
                        aria-label="Unread"
                        className="h-2 w-2 rounded-full bg-brand"
                      />
                    ) : null}
                  </div>
                  <p className="line-clamp-1 text-[12px] text-ink-muted">
                    {m.message}
                  </p>
                  <span className="text-[10px] text-ink-muted">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        {selected ? (
          <>
            <header className="flex flex-col gap-1">
              <h3 className="font-display text-[18px] font-extrabold text-ink">
                {selected.name}
              </h3>
              <a
                href={`mailto:${selected.email}`}
                className="text-[13px] font-semibold text-brand underline"
              >
                {selected.email}
              </a>
              <span className="text-[11px] text-ink-muted">
                {new Date(selected.createdAt).toLocaleString()}
              </span>
            </header>
            <p className="whitespace-pre-wrap rounded-xl bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink">
              {selected.message}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-ink-muted">
            Select a message on the left to read it.
          </p>
        )}
      </div>
    </section>
  );
}