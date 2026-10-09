// Shared types for the whole project.
// DB rows use snake_case; everything the app works with uses camelCase.

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  unit: string; // e.g. "1 ליטר", 'ק"ג'
  price: number; // shekels, as stored in the DB (NUMERIC(10,2))
  stockQuantity: number;
  imageUrl: string | null;
  category: Category;
}

/** Storefront filters, taken from the URL (?q=...&category=...). */
export interface CatalogFilters {
  query: string;
  categorySlug: string | null;
}

/**
 * One line in the shopping cart, as saved in localStorage.
 * Deliberately has NO price: prices always come from the server.
 */
export interface CartLine {
  productId: number;
  quantity: number;
}

// ---------------------------------------------------------------------
// Orders API
// ---------------------------------------------------------------------

/** Delivery/contact details. No payment data — this project takes no payments. */
export interface CustomerDetails {
  fullName: string;
  phone: string; // normalized to digits, e.g. "0501234567"
  email?: string;
  city: string;
  address: string;
  notes?: string;
}

/**
 * Body of POST /api/orders (plus an Idempotency-Key header).
 * Only product ids and quantities — prices and totals are never accepted.
 */
export interface CreateOrderRequest {
  customer: CustomerDetails;
  items: CartLine[];
}

export type OrderStatus = "pending" | "paid" | "preparing" | "shipped" | "delivered" | "cancelled";

export interface OrderLine {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number; // price at the time of purchase, from the DB
  lineTotal: number;
}

export interface OrderConfirmation {
  orderId: number;
  status: OrderStatus;
  totalAmount: number; // calculated by the database
  createdAt: string;
  items: OrderLine[];
}

export interface ProductsResponse {
  products: Product[];
  count: number;
}

export type ApiErrorCode =
  | "INVALID_JSON"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_QUERY"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "IDEMPOTENCY_KEY_REUSED"
  | "CONFLICT_RETRY"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

/** Every API error has this shape. Never contains DB internals or stack traces. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string; // safe to show to the user (Hebrew)
    details?: unknown;
    requestId: string; // matches the server log line for this request
  };
}
