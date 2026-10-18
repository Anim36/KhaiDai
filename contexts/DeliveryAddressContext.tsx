"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/* -------------------------------------------------------------------------- */
/*  Delivery Address Context                                                  */
/* -------------------------------------------------------------------------- */
// App-wide holder for the address the customer picked on the homepage
// hero, the navbar, or via the checkout map. The checkout page reads
// from here so a pin chosen before login survives the auth/role
// round-trip.
//
// We also expose `openPicker` / `closePicker` so any component
// (HeroSection, TopNav, checkout, etc.) can launch the same modal
// without each one having to mount its own copy. The actual modal
// lives in <DeliveryAddressModalHost> at the root of the layout so
// only one instance ever renders.

export type DeliveryAddress = {
  fullAddress: string;
  city: string;
  area?: string | null;
  latitude: number;
  longitude: number;
};

type Ctx = {
  address: DeliveryAddress | null;
  setAddress: (a: DeliveryAddress | null) => void;
  clear: () => void;
  /** True while the global address-picker modal is visible. */
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
};

const DeliveryAddressContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "khaidai:delivery-address";

export function DeliveryAddressProvider({ children }: { children: ReactNode }) {
  const [address, setAddressState] = useState<DeliveryAddress | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Restore on mount so the navbar pill survives a hard reload. We do
  // this in `useEffect` so server-rendered HTML matches the first
  // client render (otherwise SSR and CSR produce different text and
  // React warns in dev).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DeliveryAddress;
      if (
        parsed &&
        typeof parsed.fullAddress === "string" &&
        typeof parsed.latitude === "number" &&
        typeof parsed.longitude === "number"
      ) {
        setAddressState(parsed);
      }
    } catch {
      // ignore — corrupted storage shouldn't crash the page
    }
  }, []);

  const setAddress = useCallback((a: DeliveryAddress | null) => {
    setAddressState(a);
    try {
      if (a) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore quota / privacy mode errors
    }
  }, []);

  const clear = useCallback(() => setAddress(null), [setAddress]);
  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const value = useMemo<Ctx>(
    () => ({
      address,
      setAddress,
      clear,
      pickerOpen,
      openPicker,
      closePicker,
    }),
    [address, setAddress, clear, pickerOpen, openPicker, closePicker],
  );

  return (
    <DeliveryAddressContext.Provider value={value}>
      {children}
    </DeliveryAddressContext.Provider>
  );
}

export function useDeliveryAddress(): Ctx {
  const ctx = useContext(DeliveryAddressContext);
  if (!ctx) {
    throw new Error(
      "useDeliveryAddress must be used inside <DeliveryAddressProvider>",
    );
  }
  return ctx;
}

/**
 * Short label for the navbar / pill, e.g. "Dhanmondi, Dhaka". Falls
 * back to the city, then to the full street when area is unknown.
 */
export function shortAddressLabel(
  addr: DeliveryAddress | null | undefined,
): string {
  if (!addr) return "";
  const area = (addr.area ?? "").trim();
  const city = (addr.city ?? "").trim();
  if (area && city) return `${area}, ${city}`;
  if (city) return city;
  return addr.fullAddress;
}
