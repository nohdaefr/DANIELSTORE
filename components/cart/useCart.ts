"use client";

import { useSyncExternalStore } from "react";
import type { CartLine } from "@/types";
import { getCartSnapshot, getServerCartSnapshot, subscribeCart } from "@/lib/cart-store";

/** Cart lines. Empty on the server and during hydration, then the saved cart. */
export function useCartLines(): readonly CartLine[] {
  return useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);
}

const noopSubscribe = () => () => {};

/**
 * false on the server and during hydration, true afterwards.
 * Lets the cart page show "loading" instead of flashing "empty cart"
 * before localStorage has been read.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
