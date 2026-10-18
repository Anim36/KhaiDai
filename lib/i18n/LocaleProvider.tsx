"use client";

/**
 * Lightweight i18n runtime for KhaiDai.
 *
 * Why a custom provider instead of next-intl / next-i18next?
 *  - The app uses App Router with existing URL paths (`/login`,
 *    `/rider/dashboard`, ...). next-intl's locale-prefix routing
 *    would rewrite every route.
 *  - We only need client-side locale switching (no SSR
 *    translation of dynamic URLs).
 *  - The dictionary is small and the messages are static.
 *
 * Usage:
 *   <LocaleProvider>{children}</LocaleProvider>     // in app/layout.tsx
 *   const t = useT();                            // in any component
 *   t("common.loading")                           // -> "Loading..." or "লোড হচ্ছে..."
 *   const { locale, setLocale } = useLocale();    // for navbar toggle
 *
 * Persistence: localStorage key `khaidai.locale`, default `en`.
 * Locale values: "en" | "bn".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import en from "@/messages/en.json";
import bn from "@/messages/bn.json";

export type Locale = "en" | "bn";

const STORAGE_KEY = "khaidai.locale";
const DEFAULT_LOCALE: Locale = "en";

type Messages = typeof en;
const MESSAGES: Record<Locale, Messages> = { en, bn };

type DotPath<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${P extends "" ? "" : "."}${K}`
    : T[K] extends Record<string, unknown>
    ? DotPath<T[K], `${P}${P extends "" ? "" : "."}${K}`>
    : never;
}[keyof T & string];

export type TranslationKey = DotPath<Messages>;

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "bn";
}

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore storage quota / SSR */
  }
}

function lookup(messages: Messages, key: string): string | undefined {
  const parts = key.split(".");
  let current: unknown = messages;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderComponentProps = { children: React.ReactNode };

export function LocaleProvider({ children }: LocaleProviderComponentProps) {
  // Start with default to avoid hydration mismatch; sync to
  // localStorage after mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return ctx;
}

type InterpolateParams = Record<string, string | number>;

type UseTReturn = (
  key: TranslationKey,
  fallbackOrParams?: string | InterpolateParams,
  maybeParams?: InterpolateParams,
) => string;

/**
 * Replace `{name}` placeholders in `template` with values from
 * `params`. Unknown placeholders are left as-is so we don't
 * accidentally mangle copy.
 */
function interpolate(
  template: string,
  params: InterpolateParams | undefined,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? whole : String(v);
  });
}

export function useT(): UseTReturn {
  const { locale } = useLocale();
  return useCallback<UseTReturn>(
    (key, fallbackOrParams, maybeParams) => {
      const params =
        typeof fallbackOrParams === "object" && fallbackOrParams !== null
          ? fallbackOrParams
          : maybeParams;
      const fallback =
        typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
      const translated = lookup(MESSAGES[locale], key);
      if (translated !== undefined) return interpolate(translated, params);
      // Fallback to English to avoid empty UI strings.
      const english = lookup(MESSAGES.en, key);
      if (english !== undefined) return interpolate(english, params);
      return interpolate(fallback ?? key, params);
    },
    [locale],
  );
}

export const LOCALE_STORAGE_KEY = STORAGE_KEY;
export const LOCALE_DEFAULT = DEFAULT_LOCALE;