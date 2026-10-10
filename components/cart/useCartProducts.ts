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

// Several widgets (header bar, mini cart, cart page) show the same cart.
// Requests for the same ids within a few seconds share one fetch.
const FRESH_MS = 10_000;
const cache = new Map<string, { at: number; promise: Promise<Product[]> }>();

function loadProducts(idsKey: string, force: boolean): Promise<Product[]> {
  const hit = cache.get(idsKey);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
  const promise = fetch(`/api/products?ids=${idsKey}`, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !Array.isArray((body as { products?: unknown }).products)) {
      throw new Error("Unexpected response");
    }
    return (body as { products: Product[] }).products;
  });
  cache.set(idsKey, { at: Date.now(), promise });
  promise.catch(() => cache.delete(idsKey));
  return promise;
}

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
    let active = true;
    loadProducts(idsKey, attempt > 0)
      .then((products) => active && setResult({ key: requestKey, products }))
      .catch((error: unknown) => {
        if (!active) return;
        setResult({ key: requestKey, error: error instanceof Error ? error.message : "Unknown error" });
      });
    return () => {
      active = false;
    };
  }, [idsKey, requestKey, attempt]);

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
