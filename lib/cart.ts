// Pure cart logic — no React, no browser APIs — so it is easy to test.
import type { CartLine, Product } from "@/types";
import { cartLineSchema, MAX_ORDER_LINES, MAX_QUANTITY_PER_PRODUCT, storedCartSchema } from "./validation";
import { toAgorot } from "./format";

export const EMPTY_CART: readonly CartLine[] = Object.freeze([]);

function clamp(quantity: number, max: number): number {
  return Math.max(0, Math.min(Math.floor(quantity), max, MAX_QUANTITY_PER_PRODUCT));
}

export function getQuantity(lines: readonly CartLine[], productId: number): number {
  return lines.find((line) => line.productId === productId)?.quantity ?? 0;
}

export function addItem(
  lines: readonly CartLine[],
  productId: number,
  amount = 1,
  maxQuantity = MAX_QUANTITY_PER_PRODUCT,
): CartLine[] {
  const current = getQuantity(lines, productId);
  if (current === 0 && lines.length >= MAX_ORDER_LINES) return [...lines];
  return setQuantity(lines, productId, current + amount, maxQuantity);
}

/** Quantity 0 (or less) removes the line. */
export function setQuantity(
  lines: readonly CartLine[],
  productId: number,
  quantity: number,
  maxQuantity = MAX_QUANTITY_PER_PRODUCT,
): CartLine[] {
  const next = clamp(quantity, maxQuantity);
  if (next === 0) return removeItem(lines, productId);

  const exists = lines.some((line) => line.productId === productId);
  if (!exists) return [...lines, { productId, quantity: next }];
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: next } : line,
  );
}

export function removeItem(lines: readonly CartLine[], productId: number): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function countItems(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export interface CartTotals {
  subtotalAgorot: number;
  /** Lines whose product no longer exists or is unavailable. */
  unavailableIds: number[];
}

/**
 * Display-only subtotal, using prices fetched from the server.
 * The real total is always recalculated by the database in create_order().
 */
export function calculateTotals(
  lines: readonly CartLine[],
  productsById: ReadonlyMap<number, Product>,
): CartTotals {
  let subtotalAgorot = 0;
  const unavailableIds: number[] = [];
  for (const line of lines) {
    const product = productsById.get(line.productId);
    if (!product) {
      unavailableIds.push(line.productId);
      continue;
    }
    subtotalAgorot += toAgorot(product.price) * line.quantity;
  }
  return { subtotalAgorot, unavailableIds };
}

// ---------------------------------------------------------------------
// localStorage (de)serialization. Anything malformed is dropped.
// ---------------------------------------------------------------------
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = storedCartSchema.safeParse(data);
  if (!parsed.success) return [];

  const merged = new Map<number, number>();
  for (const item of parsed.data.lines) {
    const line = cartLineSchema.safeParse(item);
    if (!line.success) continue;
    const { productId, quantity } = line.data;
    merged.set(productId, clamp((merged.get(productId) ?? 0) + quantity, MAX_QUANTITY_PER_PRODUCT));
  }
  return [...merged].slice(0, MAX_ORDER_LINES).map(([productId, quantity]) => ({ productId, quantity }));
}

export function serializeCart(lines: readonly CartLine[]): string {
  return JSON.stringify({ version: 1, lines });
}
