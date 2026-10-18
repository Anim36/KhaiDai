"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PartnerShell } from "@/components/partner/dashboard/PartnerShell";
import { PartnerMenuHeader } from "@/components/partner/dashboard/PartnerMenuHeader";
import { CategoryTabs } from "@/components/partner/dashboard/CategoryTabs";
import { MenuItemRow } from "@/components/partner/dashboard/MenuItemRow";
import { MenuItemModal } from "@/components/partner/dashboard/MenuItemModal";
import { apiFetch } from "@/lib/apiClient";
import {
  isKnownCategory,
  type MenuCategory,
  type MenuItem,
} from "@/data/menu-management";
import { useT } from "@/lib/i18n/LocaleProvider";

export function MenuManagementPage() {
  return (
    <RequireAuth role="PARTNER">
      <MenuManagementContent />
    </RequireAuth>
  );
}

function MenuManagementContent() {
  const t = useT();
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasRestaurant, setHasRestaurant] = useState<boolean>(false);
  const [category, setCategory] = useState<MenuCategory | "all">("all");
  const [modal, setModal] = useState<
    | { open: false; mode: null }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; item: MenuItem }
  >({ open: false, mode: null });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch<{
        restaurant: { menu: ApiMenuCategory[] };
      }>("/api/restaurants/me");
      if (cancelled) return;
      if (res.status === 204) {
        setHasRestaurant(false);
        setItems([]);
        return;
      }
      if (!res.ok) {
        setLoadError(res.error.message);
        setItems([]);
        return;
      }
      setHasRestaurant(true);
      const categories = res.data?.restaurant?.menu ?? [];
      const flat = categories.flatMap((cat) => cat.items ?? []);
      setItems(flat.map(apiItemToMenuItem));
    }
    load().catch((err) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : t("partner.common.loadFailed"));
      setItems([]);
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (category === "all") return items;
    return items.filter((it) => it.category === category);
  }, [items, category]);

  const handleToggle = async (id: string, next: boolean) => {
    setActionError(null);
    const previous = items;
    setItems((prev) =>
      prev ? prev.map((it) => (it.id === id ? { ...it, available: next } : it)) : prev,
    );
    const res = await apiFetch(`/api/menu-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ available: next }),
    });
    if (!res.ok) {
      setItems(previous);
      setActionError(res.error.message);
    }
  };

  const handleEdit = (id: string) => {
    const item = items?.find((it) => it.id === id);
    if (item) setModal({ open: true, mode: "edit", item });
  };

  const handleDelete = (id: string) => setPendingDeleteId(id);

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setActionError(null);
    const previous = items;
    setItems((prev) =>
      prev ? prev.filter((it) => it.id !== pendingDeleteId) : prev,
    );
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    const res = await apiFetch(`/api/menu-items/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setItems(previous);
      setActionError(res.error.message);
    }
  };

  const handleModalSubmit = async (submitted: MenuItem) => {
    setActionError(null);
    const payload = {
      name: submitted.name.trim(),
      price: parsePrice(submitted.price),
      category: submitted.category,
      description: submitted.description.trim(),
      image: submitted.image.trim() || null,
      available: submitted.available,
      options: submitted.options ?? [],
    };

    if (modal.mode === "create") {
      const res = await apiFetch<{ item: ApiMenuItem }>("/api/menu-items", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setActionError(res.error.message);
        return;
      }
      setItems((prev) => [
        apiItemToMenuItem(res.data.item),
        ...(prev ?? []),
      ]);
    } else if (modal.mode === "edit") {
      const res = await apiFetch<{ item: ApiMenuItem }>(
        `/api/menu-items/${submitted.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        setActionError(res.error.message);
        return;
      }
      setItems((prev) =>
        prev
          ? prev.map((it) =>
              it.id === submitted.id
                ? apiItemToMenuItem(res.data.item)
                : it,
            )
          : prev,
      );
    }
    setModal({ open: false, mode: null });
  };

  const pendingDeleteItem = pendingDeleteId
    ? items?.find((it) => it.id === pendingDeleteId) ?? null
    : null;

  return (
    <PartnerShell activeKey="menu">
      <PartnerMenuHeader />

      <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8">
          {loadError ? (
            <div
              role="alert"
              className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
            >
              {loadError}
            </div>
          ) : null}

          {actionError ? (
            <div
              role="alert"
              className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-[14px] font-semibold text-brand"
            >
              {actionError}
            </div>
          ) : null}

          {items === null ? (
            <MenuSkeleton />
          ) : !hasRestaurant ? (
            <NoRestaurantState />
          ) : (
            <section className="flex flex-col gap-6 w-full">
              <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
                <CategoryTabs
                  activeKey={category}
                  onSelect={(k) => setCategory(k)}
                />
                <button
                  type="button"
                  onClick={() => setModal({ open: true, mode: "create" })}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <span aria-hidden className="text-[18px] leading-none">
                    +
                  </span>
                  {t("partner.menu.addNewItem")}
                </button>
              </div>

              {filteredItems.length === 0 ? (
                <EmptyState
                  onAdd={() => setModal({ open: true, mode: "create" })}
                />
              ) : (
                <ul
                  aria-label="Menu items"
                  className="flex flex-col gap-4 w-full"
                >
                  {filteredItems.map((item) => (
                    <li key={item.id} className="w-full">
                      <MenuItemRow
                        item={item}
                        onToggle={handleToggle}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

      <MenuItemModal
        open={modal.open}
        mode={(modal.mode ?? "create") as "create" | "edit"}
        initialItem={modal.mode === "edit" ? modal.item : undefined}
        onSubmit={handleModalSubmit}
        onClose={() => setModal({ open: false, mode: null })}
      />

      <ConfirmDialog
        open={pendingDeleteItem !== null}
        title={t("partner.menu.deleteConfirm")}
        body={
          <>
            {pendingDeleteItem?.name}
          </>
        }
        confirmLabel={t("partner.common.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </PartnerShell>
  );
}

type ApiMenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string | null;
  description: string;
  available: boolean;
  options?: Array<{
    id: string;
    name: string;
    type: "SINGLE_CHOICE" | "MULTI_CHOICE";
    required: boolean;
    sortOrder: number;
    choices: Array<{
      id: string;
      label: string;
      priceDelta: number;
      sortOrder: number;
    }>;
  }>;
};

type ApiMenuCategory = {
  id: string;
  name: string;
  items: ApiMenuItem[];
};

function apiItemToMenuItem(it: ApiMenuItem): MenuItem {
  return {
    id: it.id,
    name: it.name,
    price: formatPrice(it.price),
    description: it.description,
    category: it.category,
    image: it.image || "/assets/dish-1.png",
    available: !!it.available,
    options: (it.options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      required: o.required,
      choices: o.choices.map((c) => ({
        id: c.id,
        label: c.label,
        priceDelta: c.priceDelta,
      })),
    })),
  };
}

function parsePrice(input: string): number {
  const digits = input.replace(/[^0-9.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : NaN;
}

function formatPrice(n: number): string {
  return `৳${Math.round(n).toLocaleString("en-IN")}`;
}

function NoRestaurantState() {
  const t = useT();
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white p-10 text-center">
      <span className="font-display text-[18px] font-extrabold text-ink">
        {t("partner.common.backToHome")}
      </span>
      <p className="max-w-sm text-[13px] text-ink-muted">
        {t("partner.menu.empty")}
      </p>
      <Link
        href="/partner/dashboard"
        className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {t("partner.common.backToHome")}
      </Link>
    </section>
  );
}

function MenuSkeleton() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={t("partner.menu.loading")}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[120px] animate-pulse rounded-2xl border border-line bg-white"
        />
      ))}
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-6 flex flex-col gap-5 shadow-xl">
        <h2
          id="confirm-dialog-title"
          className="font-display text-[20px] font-extrabold text-ink"
        >
          {title}
        </h2>
        <p className="text-[14px] text-ink-muted">{body}</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-xl border border-line bg-white px-6 text-[14px] font-semibold text-ink hover:bg-surface"
          >
            {t("partner.common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-12 rounded-xl bg-rose-500 px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-white p-10 text-center">
      <span className="font-display text-[16px] font-extrabold text-ink">
        {t("partner.menu.empty")}
      </span>
      <p className="text-[13px] text-ink-muted max-w-sm">
        —
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-brand px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {t("partner.menu.addNewItem")}
      </button>
    </div>
  );
}