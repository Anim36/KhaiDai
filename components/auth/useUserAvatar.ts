"use client";

import { useCallback, useEffect, useState } from "react";
import { compressImageFile } from "@/lib/clientImage";

/**
 * Per-user profile-picture persistence in localStorage.
 *
 * Why a hook instead of a plain getter:
 *   • Three different trees (TopNav, ProfileSidebar, SettingsPanel)
 *     all render the same avatar. Without a hook they'd diverge
 *     the moment one of them updates the value — TopNav would
 *     show the new pic, the sidebar would still show the old one.
 *   • `storage` events let us react to changes written from a
 *     different tab (multi-tab support, same as a real profile
 *     picture would behave).
 *
 * Storage key shape: `khaidai.avatar.<userId>` so the same browser
 * can hold a separate avatar for a CUSTOMER, a PARTNER and a
 * RIDER signed in at different times. The hook is keyed off the
 * user id so swapping identity swaps the displayed picture.
 *
 * The avatar is a data URL (`data:image/jpeg;base64,...`) so the
 * browser can render it directly from the saved string without a
 * server round-trip. We run every pick through the canvas
 * compressor (`compressImageFile`) before storing so a 6 MB phone
 * photo lands at ~50 KB, well under the 1.5 MB localStorage
 * budget and Vercel's 4.5 MB body cap if/when it ever ships up.
 */

const STORAGE_PREFIX = "khaidai.avatar.";
/** Hard cap on the *compressed* avatar payload. localStorage budgets
 *  are ~5 MB per origin so this leaves headroom for the rest of
 *  the page state. */
export const MAX_AVATAR_BYTES = 1_500_000;

function readKey(userId: string | null | undefined): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + userId);
  } catch {
    return null;
  }
}

function writeKey(userId: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_PREFIX + userId, value);
    } else {
      window.localStorage.removeItem(STORAGE_PREFIX + userId);
    }
    // Notify same-tab listeners. (Storage events only fire across
    // tabs — we need a manual ping for the writing tab itself.)
    window.dispatchEvent(
      new CustomEvent("khaidai:avatar-changed", {
        detail: { userId, value },
      }),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

export function useUserAvatar(userId: string | null | undefined): {
  avatar: string | null;
  setAvatar: (next: string | null) => void;
  uploadAvatar: (file: File | null) => Promise<void>;
} {
  const [avatar, setAvatarState] = useState<string | null>(() =>
    readKey(userId),
  );

  // Re-read whenever the user id changes (login/logout/swap).
  useEffect(() => {
    setAvatarState(readKey(userId));
  }, [userId]);

  // Listen for storage + custom events so changes from any
  // component (or another tab) propagate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setAvatarState(readKey(userId));
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ userId: string }>).detail;
      if (detail?.userId === userId) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_PREFIX + userId) refresh();
    };
    window.addEventListener("khaidai:avatar-changed", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("khaidai:avatar-changed", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  const setAvatar = useCallback(
    (next: string | null) => {
      if (!userId) return;
      writeKey(userId, next);
      setAvatarState(next);
    },
    [userId],
  );

  const uploadAvatar = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!userId) return;
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
      }
      // Compress first so even a 6 MB phone photo lands at
      // ~50 KB JPEG — well under both localStorage's quota and
      // Vercel's 4.5 MB request-body cap.
      const dataUrl = await compressImageFile(file);
      if (dataUrl.length > MAX_AVATAR_BYTES) {
        // Surface as a thrown error so the caller can show a
        // toast — for now we'll just log; the Settings UI
        // handles its own inline error.
        throw new Error(
          `Image is still too large after compression (max ${Math.round(MAX_AVATAR_BYTES / 1024)} KB).`,
        );
      }
      setAvatar(dataUrl);
    },
    [setAvatar, userId],
  );

  return { avatar, setAvatar, uploadAvatar };
}
