import "server-only";
import { z } from "zod";
import type { ApiErrorCode, OrderConfirmation } from "@/types";
import { createOrderAsServer, type CreateOrderArgs } from "./supabase-admin";
import { createUserClient } from "./supabase";
import type { ValidCreateOrder } from "./validation";

export interface OrderFailure {
  status: number;
  code: ApiErrorCode;
  message: string; // safe for end users
  details?: Record<string, string | number>;
  retryAfterSeconds?: number;
  /** Original error, for the server log only. */
  internal?: unknown;
}

export type CreateOrderOutcome =
  | { ok: true; order: OrderConfirmation; replayed: boolean }
  | { ok: false; failure: OrderFailure };

/**
 * The exact arguments sent to create_order(). Built field by field from
 * VALIDATED input, so nothing else the client sent can reach the database.
 */
export function toCreateOrderArgs(input: ValidCreateOrder, idempotencyKey: string): CreateOrderArgs {
  const { customer, items } = input;
  return {
    p_customer: {
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email ?? null,
      city: customer.city,
      address: customer.address,
      notes: customer.notes ?? null,
    },
    p_items: items.map(({ productId, quantity }) => ({ product_id: productId, quantity })),
    p_idempotency_key: idempotencyKey,
  };
}

// Shape returned by create_order() (see order_summary in the migration)
const orderSummarySchema = z.object({
  order_id: z.number().int().positive(),
  status: z.enum(["pending", "paid", "preparing", "shipped", "delivered", "cancelled"]),
  total_amount: z.coerce.number(),
  created_at: z.string(),
  replayed: z.boolean(),
  items: z.array(
    z.object({
      product_id: z.number().int(),
      product_name: z.string(),
      quantity: z.number().int(),
      unit_price: z.coerce.number(),
      line_total: z.coerce.number(),
    }),
  ),
});

function toConfirmation(summary: z.output<typeof orderSummarySchema>): OrderConfirmation {
  return {
    orderId: summary.order_id,
    status: summary.status,
    totalAmount: summary.total_amount,
    createdAt: summary.created_at,
    items: summary.items.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
  };
}

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** Reads the JSON in DETAIL, keeping only plain string/number fields. */
function parseDetail(details: string | null | undefined): Record<string, string | number> {
  if (!details) return {};
  try {
    const value: unknown = JSON.parse(details);
    if (typeof value !== "object" || value === null) return {};
    const safe: Record<string, string | number> = {};
    for (const [key, field] of Object.entries(value)) {
      if (typeof field === "string" || typeof field === "number") safe[key] = field;
    }
    return safe;
  } catch {
    return {};
  }
}

const FIELD_NAMES: Record<string, string> = {
  full_name: "customer.fullName",
  phone: "customer.phone",
  email: "customer.email",
  city: "customer.city",
  address: "customer.address",
  notes: "customer.notes",
};

/** Maps a database error to a safe HTTP outcome. Unknown errors become a generic 500. */
export function mapDbError(error: DbError, signedIn: boolean): OrderFailure {
  const code = error.code ?? "";
  const detail = parseDetail(error.details);

  if (code === "P0001") {
    switch (error.message) {
      case "PRODUCT_NOT_FOUND":
        return {
          status: 422,
          code: "PRODUCT_NOT_FOUND",
          message: `מוצר ${detail.product_id} לא קיים בקטלוג`,
          details: { productId: detail.product_id },
        };
      case "PRODUCT_UNAVAILABLE":
        return {
          status: 409,
          code: "PRODUCT_UNAVAILABLE",
          message: `"${detail.product_name ?? "המוצר"}" אינו זמין כרגע`,
          details: { productId: detail.product_id },
        };
      case "INSUFFICIENT_STOCK":
        return {
          status: 409,
          code: "INSUFFICIENT_STOCK",
          message: `אין מספיק מלאי עבור "${detail.product_name ?? "המוצר"}": התבקשו ${detail.requested}, זמינים ${detail.available}`,
          details: { productId: detail.product_id, requested: detail.requested, available: detail.available },
        };
      case "IDEMPOTENCY_KEY_REUSED":
        return {
          status: 422,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "מפתח הבקשה (Idempotency-Key) כבר שימש להזמנה אחרת. צרו מפתח חדש להזמנה חדשה.",
        };
      case "INVALID_CUSTOMER":
      case "INVALID_ITEMS":
      case "INVALID_REQUEST": {
        // Normally caught by the API validation first; the DB checks again.
        const field = typeof detail.field === "string" ? (FIELD_NAMES[detail.field] ?? detail.field) : "items";
        return {
          status: 422,
          code: "VALIDATION_FAILED",
          message: "נתוני ההזמנה אינם תקינים",
          details: { field, ...(detail.reason ? { reason: detail.reason } : {}) },
        };
      }
    }
  }

  // Not signed in / bad or expired token
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303" || (code === "42501" && signedIn)) {
    return { status: 401, code: "UNAUTHORIZED", message: "יש להתחבר מחדש כדי לבצע הזמנה", internal: error };
  }

  // Concurrency: another order held the product row too long, or a deadlock/serialization retry
  if (code === "55P03" || code === "40P01" || code === "40001") {
    return {
      status: 409,
      code: "CONFLICT_RETRY",
      message: "המערכת עמוסה כרגע. נסו שוב בעוד רגע — לא בוצע חיוב והמלאי לא השתנה.",
      retryAfterSeconds: 1,
      internal: error,
    };
  }

  // Database unreachable / timeout (supabase-js reports network failures with an empty code)
  if (code === "" || code === "PGRST000" || code === "PGRST001" || code === "PGRST002" || code === "57014") {
    return { status: 503, code: "SERVICE_UNAVAILABLE", message: "השירות אינו זמין כרגע. נסו שוב בעוד רגע.", internal: error };
  }

  return { status: 500, code: "INTERNAL_ERROR", message: "אירעה שגיאה בעיבוד ההזמנה", internal: error };
}

/**
 * Creates the order through the database function create_order(), which
 * does the pricing, stock check and writes in a single transaction.
 *
 * - Signed-in customer: called with THEIR token (role authenticated, RLS applies).
 * - Guest: called by the server with the service role (server-only key).
 */
export async function createOrder(
  input: ValidCreateOrder,
  { accessToken, idempotencyKey }: { accessToken: string | null; idempotencyKey: string },
): Promise<CreateOrderOutcome> {
  const args = toCreateOrderArgs(input, idempotencyKey);

  const { data, error } = accessToken
    ? await createUserClient(accessToken).rpc("create_order", args)
    : await createOrderAsServer(args);

  if (error) return { ok: false, failure: mapDbError(error, accessToken !== null) };

  const parsed = orderSummarySchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      failure: { status: 500, code: "INTERNAL_ERROR", message: "אירעה שגיאה בעיבוד ההזמנה", internal: parsed.error },
    };
  }
  return { ok: true, order: toConfirmation(parsed.data), replayed: parsed.data.replayed };
}
