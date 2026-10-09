"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/types";

export type CartProductsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; productsById: ReadonlyMap<number, Product> };

type Result =
  | { key: string; products: Product[] }
  | { key: string; error: string };

/**
 * Loads current product data (price, stock, name) for the given ids
 * from GET /api/products. Prices are never taken from localStorage.
 */
export function useCartProducts(ids: readonly number[]): CartProductsState & { retry: () => void } {
  const idsKey = [...ids].sort((a, b) => a - b).join(",");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const requestKey = `${idsKey}#${attempt}`;

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();

    fetch(`/api/products?ids=${idsKey}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          body === null ||
          !Array.isArray((body as { products?: unknown }).products)
        ) {
          throw new Error("Unexpected response");
        }
        setResult({ key: requestKey, products: (body as { products: Product[] }).products });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });

    return () => controller.abort();
  }, [idsKey, requestKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!idsKey) return { status: "idle", retry };

  if (result && "products" in result) {
    const productsById = new Map(result.products.map((p) => [p.id, p]));
    const isCurrent = result.key === requestKey;
    // After removing an item the remaining ids are a subset of what we
    // already have, so keep showing it instead of flashing a loader.
    const coversAll = ids.every((id) => productsById.has(id));
    if (isCurrent || coversAll) return { status: "ready", productsById, retry };
  }

  if (result && "error" in result && result.key === requestKey) {
    return { status: "error", message: result.error, retry };
  }

  return { status: "loading", retry };
}
