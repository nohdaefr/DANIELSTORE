"use client";

import { calculateTotals, countItems } from "@/lib/cart";
import { useCartLines, useHydrated } from "./useCart";
import { useCartProducts } from "./useCartProducts";

/** Cart lines + current server prices, for the small cart widgets. */
export function useCartSummary() {
  const hydrated = useHydrated();
  const lines = useCartLines();
  const products = useCartProducts(lines.map((line) => line.productId));
  const count = countItems(lines);
  const ready = products.status === "ready";
  const subtotalAgorot = ready ? calculateTotals(lines, products.productsById).subtotalAgorot : null;
  return { hydrated, lines, products, count, subtotalAgorot };
}
