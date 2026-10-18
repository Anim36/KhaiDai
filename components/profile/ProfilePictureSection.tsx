"use client";

import { useState } from "react";
import { useUserAvatar } from "@/components/auth/useUserAvatar";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * Avatar upload row used on every settings page. Renders a
 * circular preview that doubles as a file-picker trigger,
 * plus a "Replace / Remove" action and an inline error slot.
 *
 * Owns nothing globally — picture persistence goes through
 * `useUserAvatar(userId)` so the value is shared with the
 * TopNav pill and the sidebar avatar.
 *
 * `userName` is used to compute the initials fallback.
 */

export function ProfilePictureSection({
  userId,
  userName,
  description,
}: {
  userId: string | null | undefined;
  userName: string | null | undefined;
  description?: string;
}) {
  const t = useT();
  const { avatar, uploadAvatar, setAvatar } = useUserAvatar(userId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = (userName ?? "?").trim().split(/\s+/).slice(0, 2)
    .map((s) => s[0] ?? "").join("").toUpperCase() || "?";

  const onPick = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setPending(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.profilePicture.uploadFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">
          {t("profile.profilePicture.title")}
        </h2>
        <p className="text-[12px] text-ink-muted">
          {description ??
            t("profile.profilePicture.defaultDesc")}
        </p>
      </header>

      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
        <label
          htmlFor={`profile-picture-input-${userId ?? "anon"}`}
          className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-[24px] font-extrabold text-brand ring-1 ring-line"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
            Edit
          </span>
          <input
            id={`profile-picture-input-${userId ?? "anon"}`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="font-display text-[14px] font-bold text-ink">
            {userName ?? "Signed-in user"}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(`profile-picture-input-${userId ?? "anon"}`)
                  ?.click()
              }
              className="inline-flex h-9 items-center justify-center rounded-xl border border-line bg-white px-4 text-[12px] font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              {avatar ? t("profile.profilePicture.replace") : t("profile.profilePicture.upload")}
            </button>
            {avatar ? (
              <button
                type="button"
                onClick={() => {
                  setAvatar(null);
                  setError(null);
                }}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-line bg-white px-4 text-[12px] font-semibold text-ink-muted transition-colors hover:border-rose-300 hover:text-rose-600"
              >
                {t("profile.profilePicture.remove")}
              </button>
            ) : null}
          </div>
          {error ? (
            <span className="text-[12px] font-semibold text-rose-600">
              {error}
            </span>
          ) : pending ? (
            <span className="text-[12px] text-ink-muted">{t("profile.profilePicture.uploading")}</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
