import { describe, expect, it } from "vitest";
import {
  addItem,
  calculateTotals,
  countItems,
  getQuantity,
  parseStoredCart,
  removeItem,
  serializeCart,
  setQuantity,
} from "@/lib/cart";
import type { CartLine, Product } from "@/types";

const category = { id: 1, name: "מוצרי חלב", slug: "dairy-eggs" };
function product(id: number, price: number, stockQuantity = 50): Product {
  return { id, sku: `SKU-${id}`, name: `מוצר ${id}`, description: null, unit: "יחידה", price, stockQuantity, imageUrl: null, category };
}

describe("cart operations", () => {
  it("adds a new product with quantity 1", () => {
    expect(addItem([], 7)).toEqual([{ productId: 7, quantity: 1 }]);
  });

  it("increments an existing product instead of duplicating it", () => {
    const lines = addItem(addItem([], 7), 7);
    expect(lines).toEqual([{ productId: 7, quantity: 2 }]);
  });

  it("never exceeds the available stock", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < 5; i++) lines = addItem(lines, 3, 1, 2);
    expect(getQuantity(lines, 3)).toBe(2);
  });

  it("never exceeds 100 per product (DB limit)", () => {
    expect(setQuantity([], 1, 5000)).toEqual([{ productId: 1, quantity: 100 }]);
  });

  it("removes the line when quantity drops to 0 or below", () => {
    const lines = [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 3 }];
    expect(setQuantity(lines, 1, 0)).toEqual([{ productId: 2, quantity: 3 }]);
    expect(setQuantity(lines, 2, -4)).toEqual([{ productId: 1, quantity: 1 }]);
  });

  it("removes a product", () => {
    expect(removeItem([{ productId: 1, quantity: 2 }], 1)).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const lines = Object.freeze([{ productId: 1, quantity: 1 }]);
    expect(() => addItem(lines, 1)).not.toThrow();
    expect(lines[0].quantity).toBe(1);
  });

  it("counts total units", () => {
    expect(countItems([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }])).toBe(5);
  });
});

describe("calculateTotals", () => {
  it("sums in agorot without floating-point drift", () => {
    // 3 x 0.10 + 1 x 0.20 = 0.50 exactly (floats would give 0.5000000000000001)
    const products = new Map([[1, product(1, 0.1)], [2, product(2, 0.2)]]);
    const totals = calculateTotals([{ productId: 1, quantity: 3 }, { productId: 2, quantity: 1 }], products);
    expect(totals.subtotalAgorot).toBe(50);
  });

  it("matches the DB example: 3 x 6.90 + 2 x 39.90 = 100.50", () => {
    const products = new Map([[1, product(1, 6.9)], [2, product(2, 39.9)]]);
    const totals = calculateTotals([{ productId: 1, quantity: 3 }, { productId: 2, quantity: 2 }], products);
    expect(totals.subtotalAgorot).toBe(10050);
  });

  it("excludes and reports products the server did not return", () => {
    const products = new Map([[1, product(1, 5)]]);
    const totals = calculateTotals([{ productId: 1, quantity: 1 }, { productId: 99, quantity: 4 }], products);
    expect(totals).toEqual({ subtotalAgorot: 500, unavailableIds: [99] });
  });
});

describe("localStorage parsing", () => {
  it("round-trips a valid cart", () => {
    const lines = [{ productId: 1, quantity: 2 }, { productId: 5, quantity: 1 }];
    expect(parseStoredCart(serializeCart(lines))).toEqual(lines);
  });

  it("stores only ids and quantities — no prices", () => {
    const raw = serializeCart([{ productId: 1, quantity: 2 }]);
    expect(raw).not.toMatch(/price|total/i);
  });

  it.each([
    ["null", null],
    ["empty string", ""],
    ["broken JSON", "{not json"],
    ["wrong shape", JSON.stringify([1, 2, 3])],
    ["wrong version", JSON.stringify({ version: 2, lines: [{ productId: 1, quantity: 1 }] })],
  ])("returns an empty cart for %s", (_name, raw) => {
    expect(parseStoredCart(raw)).toEqual([]);
  });

  it("drops invalid lines but keeps valid ones", () => {
    const raw = JSON.stringify({
      version: 1,
      lines: [
        { productId: 1, quantity: 2 },
        { productId: -5, quantity: 1 },
        { productId: 2, quantity: 0 },
        { productId: 3, quantity: 1.5 },
        { productId: "4", quantity: 1 },
        { productId: 6, quantity: 1, price: 0.01 }, // extra key is ignored
        "garbage",
      ],
    });
    expect(parseStoredCart(raw)).toEqual([
      { productId: 1, quantity: 2 },
      { productId: 6, quantity: 1 },
    ]);
  });

  it("merges duplicate product lines and caps at 100", () => {
    const raw = JSON.stringify({ version: 1, lines: [{ productId: 1, quantity: 80 }, { productId: 1, quantity: 80 }] });
    expect(parseStoredCart(raw)).toEqual([{ productId: 1, quantity: 100 }]);
  });
});
