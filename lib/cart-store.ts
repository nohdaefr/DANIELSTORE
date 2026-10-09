// Browser-side cart store backed by localStorage.
// Used through the hooks in components/cart/useCart.ts.
import type { CartLine } from "@/types";
import { EMPTY_CART, addItem, parseStoredCart, removeItem, serializeCart, setQuantity } from "./cart";

export const CART_STORAGE_KEY = "supermarket.cart.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedRaw: string | null | undefined; // undefined = not read yet
let cachedLines: readonly CartLine[] = EMPTY_CART;
let memoryFallback: string | null = null; // used if localStorage is blocked

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return memoryFallback;
  }
}

function writeRaw(raw: string): void {
  memoryFallback = raw;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, raw);
  } catch {
    // Storage full or blocked (e.g. some private modes): keep the cart in memory.
  }
}

/** Returns the same array instance until the stored value changes. */
export function getCartSnapshot(): readonly CartLine[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLines = parseStoredCart(raw);
  }
  return cachedLines;
}

export function getServerCartSnapshot(): readonly CartLine[] {
  return EMPTY_CART;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key === CART_STORAGE_KEY || event.key === null) emit(); // other tab changed the cart
}

export function subscribeCart(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function update(next: CartLine[]): void {
  writeRaw(serializeCart(next));
  emit();
}

export const cartActions = {
  add(productId: number, maxQuantity?: number): void {
    update(addItem(getCartSnapshot(), productId, 1, maxQuantity));
  },
  setQuantity(productId: number, quantity: number, maxQuantity?: number): void {
    update(setQuantity(getCartSnapshot(), productId, quantity, maxQuantity));
  },
  remove(productId: number): void {
    update(removeItem(getCartSnapshot(), productId));
  },
  clear(): void {
    update([]);
  },
};
