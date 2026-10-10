import { describe, expect, it } from "vitest";
import { formatAgorot, splitPrice, toAgorot, unitPriceLabel } from "@/lib/format";
import { createOrderSchema, normalizePhone, parseCatalogFilters, parseProductIds, sanitizeSearch } from "@/lib/validation";

describe("money formatting", () => {
  it("converts shekels to agorot exactly", () => {
    expect(toAgorot(6.9)).toBe(690);
    expect(toAgorot(39.9)).toBe(3990);
    expect(toAgorot(0.1 + 0.2)).toBe(30);
  });

  it("splits a price for the shelf tag", () => {
    expect(splitPrice(6.9)).toEqual({ shekels: "6", agorot: "90" });
    expect(splitPrice(13.5)).toEqual({ shekels: "13", agorot: "50" });
    expect(splitPrice(4)).toEqual({ shekels: "4", agorot: "00" });
  });

  it("formats in shekels with two decimals", () => {
    const text = formatAgorot(10050);
    expect(text).toContain("100.50");
    expect(text).toContain("₪");
  });
});

describe("search input", () => {
  it("removes LIKE / PostgREST wildcard and syntax characters", () => {
    expect(sanitizeSearch("חלב%_*")).toBe("חלב");
    expect(sanitizeSearch("a,b(c)\\d")).toBe("a b c d");
  });

  it("trims, collapses spaces and limits length", () => {
    expect(sanitizeSearch("  לחם   מלא ")).toBe("לחם מלא");
    expect(sanitizeSearch("א".repeat(500))).toHaveLength(60);
  });

  it("ignores non-string values", () => {
    expect(sanitizeSearch(undefined)).toBe("");
    expect(sanitizeSearch(["x"])).toBe("");
  });

  it("parses URL filters and rejects bad category slugs", () => {
    expect(parseCatalogFilters({ q: "חלב", category: "dairy-eggs" })).toEqual({ query: "חלב", categorySlug: "dairy-eggs" });
    expect(parseCatalogFilters({ category: "'; drop table" })).toEqual({ query: "", categorySlug: null });
    expect(parseCatalogFilters({ q: ["first", "second"] })).toEqual({ query: "first", categorySlug: null });
  });
});

describe("product id list (GET /api/products?ids=)", () => {
  it("accepts a valid list and removes duplicates", () => {
    expect(parseProductIds("3,1,3")).toEqual([3, 1]);
  });

  it.each([null, "", "1,,2", "1,abc", "-1", "1.5", "0", Array.from({ length: 51 }, (_, i) => i + 1).join(",")])(
    "rejects %s",
    (raw) => {
      expect(parseProductIds(raw)).toBeNull();
    },
  );
});

const customer = { fullName: "דנה כהן", phone: "0501234567", city: "חיפה", address: "הנביאים 5" };

describe("order schema", () => {
  it("rejects (does not silently strip) price and total fields", () => {
    const result = createOrderSchema.safeParse({
      customer,
      total: 0.01,
      items: [{ productId: 1, quantity: 2, price: 0.01 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid order and normalizes it", () => {
    const parsed = createOrderSchema.parse({
      customer: { ...customer, fullName: "  דנה כהן ", email: " Dana@Example.COM ", notes: "" },
      items: [{ productId: 1, quantity: 2 }],
    });
    expect(parsed.customer).toEqual({ ...customer, email: "dana@example.com" });
  });

  it.each([
    ["empty items", { customer, items: [] }],
    ["zero quantity", { customer, items: [{ productId: 1, quantity: 0 }] }],
    ["over 100", { customer, items: [{ productId: 1, quantity: 101 }] }],
    ["fractional", { customer, items: [{ productId: 1, quantity: 1.5 }] }],
    ["string id", { customer, items: [{ productId: "1", quantity: 1 }] }],
    ["missing items", { customer }],
    ["missing customer", { items: [{ productId: 1, quantity: 1 }] }],
  ])("rejects %s", (_name, body) => {
    expect(createOrderSchema.safeParse(body).success).toBe(false);
  });
});

describe("phone normalization", () => {
  it.each([
    ["050-123-4567", "0501234567"],
    ["+972 50 123 4567", "0501234567"],
    ["(03) 123-4567", "031234567"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});


describe("unitPriceLabel (price per 100 g / 100 ml / unit)", () => {
  const plain = (s: string | null) => s?.replace(/[‏ ]/g, " ").replace(/\s+/g, " ").trim() ?? null;
  it.each([
    [6.9, "1 ליטר", "0.69 ₪ ל־100 מ״ל"],
    [3.5, "1.5 ליטר", "0.23 ₪ ל־100 מ״ל"],
    [39.9, '750 מ"ל', "5.32 ₪ ל־100 מ״ל"],
    [5.5, "250 גרם", "2.20 ₪ ל־100 גרם"],
    [11.9, '1 ק"ג', "1.19 ₪ ל־100 גרם"],
    [13.5, "12 יחידות", "1.13 ₪ ליחידה"],
  ])("%s for %s -> %s", (price, unit, expected) => {
    expect(plain(unitPriceLabel(price, unit))).toBe(expected);
  });

  it.each(['ק"ג', "יחידה", "1 יחידות", "חבילה", ""])("no label for %s", (unit) => {
    expect(unitPriceLabel(10, unit)).toBeNull();
  });
});
