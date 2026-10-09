import "server-only";
import type { CatalogFilters, Category, Product } from "@/types";
import { createAnonClient } from "./supabase";
import {
  categoryRowSchema,
  productRowSchema,
  type CategoryRow,
  type ProductRow,
} from "./validation";

/** A database/network failure while loading the catalog. */
export class CatalogError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CatalogError";
  }
}

const PRODUCT_COLUMNS =
  "id, category_id, sku, name, description, unit, price, stock_quantity, image_url";

function parseRows<T>(rows: unknown, schema: { parse: (row: unknown) => T }, what: string): T[] {
  if (!Array.isArray(rows)) throw new CatalogError(`Unexpected ${what} response`);
  try {
    return rows.map((row) => schema.parse(row));
  } catch (cause) {
    throw new CatalogError(`Invalid ${what} data from the database`, { cause });
  }
}

function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, slug: row.slug };
}

function toProduct(row: ProductRow, categories: ReadonlyMap<number, Category>): Product | null {
  const category = categories.get(row.category_id);
  if (!category) return null;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: row.price,
    stockQuantity: row.stock_quantity,
    imageUrl: row.image_url,
    category,
  };
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await createAnonClient()
    .from("categories")
    .select("id, name, slug")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new CatalogError("Failed to load categories", { cause: error });
  return parseRows(data, categoryRowSchema, "category").map(toCategory);
}

export interface Catalog {
  categories: Category[];
  activeCategory: Category | null;
  products: Product[];
}

/**
 * Products for the storefront. RLS already hides unavailable products
 * from the anon role; we never rely on the browser to filter them.
 */
export async function getCatalog(filters: CatalogFilters): Promise<Catalog> {
  const categories = await getCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const activeCategory = filters.categorySlug
    ? (categories.find((c) => c.slug === filters.categorySlug) ?? null)
    : null;

  // Unknown category slug in the URL -> empty result, not an error page
  if (filters.categorySlug && !activeCategory) {
    return { categories, activeCategory: null, products: [] };
  }

  let query = createAnonClient()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("name", { ascending: true });

  if (activeCategory) query = query.eq("category_id", activeCategory.id);
  if (filters.query) query = query.ilike("name", `%${filters.query}%`);

  const { data, error } = await query;
  if (error) throw new CatalogError("Failed to load products", { cause: error });

  const products = parseRows(data, productRowSchema, "product")
    .map((row) => toProduct(row, byId))
    .filter((p): p is Product => p !== null);

  return { categories, activeCategory, products };
}

/** Current data for specific products (used by the cart). */
export async function getProductsByIds(ids: number[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const [categories, result] = await Promise.all([
    getCategories(),
    createAnonClient().from("products").select(PRODUCT_COLUMNS).in("id", ids),
  ]);

  if (result.error) throw new CatalogError("Failed to load products", { cause: result.error });
  const byId = new Map(categories.map((c) => [c.id, c]));
  return parseRows(result.data, productRowSchema, "product")
    .map((row) => toProduct(row, byId))
    .filter((p): p is Product => p !== null);
}
