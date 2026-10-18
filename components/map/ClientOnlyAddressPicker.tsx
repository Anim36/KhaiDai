"use client";

import dynamic from "next/dynamic";
import type { PickedAddress } from "./AddressPicker";

/* -------------------------------------------------------------------------- */
/*  Client-only AddressPicker wrapper                                         */
/* -------------------------------------------------------------------------- */
// Leaflet touches `window` during module evaluation, which crashes
// Next.js' server-side render. We hide it behind a dynamic import
// with `ssr: false` so the picker only ever runs in the browser.
//
// The exported props intentionally mirror `AddressPicker` exactly so
// callers don't need to know about the split.

const Inner = dynamic(
  () => import("./AddressPicker").then((m) => m.AddressPicker),
  { ssr: false },
);

export function ClientOnlyAddressPicker(
  props: {
    initial?: { latitude: number; longitude: number; fullAddress?: string } | null;
    onConfirm: (picked: PickedAddress) => void;
    onCancel?: () => void;
    confirmLabel?: string;
    className?: string;
  },
) {
  return <Inner {...props} />;
}

export type { PickedAddress } from "./AddressPicker";
