"use client";

import { useEffect } from "react";
import {
  ClientOnlyAddressPicker as AddressPicker,
  PickedAddress,
} from "@/components/map/ClientOnlyAddressPicker";
import { useDeliveryAddress } from "@/contexts/DeliveryAddressContext";

/**
 * Single global instance of the address-picker modal. Mounted once
 * at the root layout by <DeliveryAddressProvider>. Any component can
 * call `openPicker()` from `useDeliveryAddress()` to surface it.
 *
 * Rendered as a sibling of the page tree (not inside a specific page)
 * so the modal can be launched from the navbar, the homepage hero,
 * the checkout flow, or anywhere else with the same single instance.
 */
export function DeliveryAddressModalHost() {
  const { address, setAddress, pickerOpen, closePicker } = useDeliveryAddress();

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  // Close on Escape — matches the convention Foodpanda / Wolt users expect.
  useEffect(() => {
    if (!pickerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePicker();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen, closePicker]);

  function handleConfirm(picked: PickedAddress) {
    setAddress(picked);
    closePicker();
  }

  if (!pickerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose delivery address"
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 px-3 py-6 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePicker();
      }}
    >
      <div className="w-full max-w-3xl">
        <AddressPicker
          initial={
            address
              ? {
                  latitude: address.latitude,
                  longitude: address.longitude,
                  fullAddress: address.fullAddress,
                }
              : null
          }
          onConfirm={handleConfirm}
          onCancel={closePicker}
          confirmLabel="Use this address"
        />
      </div>
    </div>
  );
}
