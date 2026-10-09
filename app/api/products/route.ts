import { jsonError, jsonResponse, logServerError, newRequestId } from "@/lib/api";
import { CatalogError, getCatalog, getProductsByIds } from "@/lib/catalog";
import { SupabaseConfigError } from "@/lib/supabase";
import { parseProductsQuery } from "@/lib/validation";
import type { ProductsResponse } from "@/types";

/**
 * GET /api/products — available products (read with the anon role; RLS
 * hides products that are not available).
 *
 *   /api/products                     all available products
 *   /api/products?q=חלב               search by name
 *   /api/products?category=drinks     one category (can be combined with q)
 *   /api/products?ids=1,2,3           specific products (used by the cart)
 *
 * 200 { products, count } · 400 INVALID_QUERY · 503 SERVICE_UNAVAILABLE
 */
export async function GET(request: Request) {
  const requestId = newRequestId();
  const query = parseProductsQuery(new URL(request.url).searchParams);
  if ("error" in query) return jsonError(400, "INVALID_QUERY", query.error, { requestId });

  try {
    const products =
      query.kind === "ids"
        ? await getProductsByIds(query.ids)
        : (await getCatalog({ query: query.query, categorySlug: query.categorySlug })).products;

    return jsonResponse({ products, count: products.length } satisfies ProductsResponse, { requestId });
  } catch (error) {
    if (error instanceof SupabaseConfigError || error instanceof CatalogError) {
      logServerError(requestId, "GET /api/products", error instanceof CatalogError ? (error.cause ?? error) : error);
      return jsonError(503, "SERVICE_UNAVAILABLE", "רשימת המוצרים אינה זמינה כרגע", { requestId });
    }
    logServerError(requestId, "GET /api/products", error);
    return jsonError(500, "INTERNAL_ERROR", "אירעה שגיאה בטעינת המוצרים", { requestId });
  }
}
