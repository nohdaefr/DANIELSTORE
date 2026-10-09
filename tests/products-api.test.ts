import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types";

const getCatalog = vi.fn();
const getProductsByIds = vi.fn();

class CatalogError extends Error {}
vi.mock("@/lib/catalog", () => ({ getCatalog, getProductsByIds, CatalogError }));
vi.mock("@/lib/supabase", () => ({ SupabaseConfigError: class SupabaseConfigError extends Error {} }));

const { GET } = await import("@/app/api/products/route");

const milk: Product = {
  id: 1,
  sku: "DAIRY-001",
  name: "חלב",
  description: null,
  unit: "1 ליטר",
  price: 6.9,
  stockQuantity: 120,
  imageUrl: null,
  category: { id: 1, name: "מוצרי חלב", slug: "dairy-eggs" },
};

const get = (query = "") => GET(new Request(`http://localhost/api/products${query}`));

beforeEach(() => {
  getCatalog.mockReset();
  getProductsByIds.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/products", () => {
  it("lists available products", async () => {
    getCatalog.mockResolvedValue({ categories: [], activeCategory: null, products: [milk] });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ products: [milk], count: 1 });
    expect(getCatalog).toHaveBeenCalledWith({ query: "", categorySlug: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("passes search and category filters", async () => {
    getCatalog.mockResolvedValue({ categories: [], activeCategory: null, products: [] });
    await get(`?q=${encodeURIComponent("חלב%")}&category=dairy-eggs`);
    expect(getCatalog).toHaveBeenCalledWith({ query: "חלב", categorySlug: "dairy-eggs" });
  });

  it("returns specific products by id (used by the cart)", async () => {
    getProductsByIds.mockResolvedValue([milk]);
    const response = await get("?ids=1,1,7");
    expect(getProductsByIds).toHaveBeenCalledWith([1, 7]);
    expect((await response.json()).count).toBe(1);
  });

  it.each([
    ["bad ids", "?ids=1,abc"],
    ["negative id", "?ids=-1"],
    ["ids combined with q", "?ids=1&q=x"],
    ["invalid category", "?category=DROP%20TABLE"],
    ["unknown parameter", "?price=0"],
  ])("%s -> 400 INVALID_QUERY", async (_label, query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
    expect(getCatalog).not.toHaveBeenCalled();
  });

  it("database failure -> 503 without internal details", async () => {
    getCatalog.mockRejectedValue(new CatalogError("Failed to load products", { cause: { message: "password authentication failed" } }));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/password|Failed to load/);
  });
});
