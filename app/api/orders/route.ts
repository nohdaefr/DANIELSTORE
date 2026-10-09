import { jsonError, jsonResponse, logServerError, newRequestId, readJsonBody } from "@/lib/api";
import { createOrder } from "@/lib/orders";
import { SupabaseConfigError } from "@/lib/supabase";
import { ServiceRoleNotConfiguredError } from "@/lib/supabase-admin";
import { createOrderSchema, idempotencyKeySchema, MAX_ORDER_BODY_BYTES, toFieldErrors } from "@/lib/validation";
import type { OrderConfirmation } from "@/types";

/**
 * POST /api/orders — create an order.
 *
 * Headers
 *   Content-Type:    application/json                     (required)
 *   Idempotency-Key: <UUID, new for every checkout>       (required)
 *   Authorization:   Bearer <Supabase access token>       (optional; without it = guest order)
 *
 * Body
 *   {
 *     "customer": { "fullName", "phone", "city", "address", "email"?, "notes"? },
 *     "items":    [{ "productId": 1, "quantity": 2 }]
 *   }
 *   Only these fields are accepted. Prices, totals, user ids or payment
 *   details are rejected with 422 — the database computes prices itself.
 *
 * Responses
 *   201 { order }                     created (or replay of the same request: header Idempotent-Replayed: true)
 *   400 INVALID_JSON / INVALID_IDEMPOTENCY_KEY
 *   401 UNAUTHORIZED                  malformed/expired token
 *   409 INSUFFICIENT_STOCK / PRODUCT_UNAVAILABLE / CONFLICT_RETRY
 *   413 PAYLOAD_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE
 *   422 VALIDATION_FAILED / PRODUCT_NOT_FOUND / IDEMPOTENCY_KEY_REUSED
 *   503 SERVICE_UNAVAILABLE, 500 INTERNAL_ERROR (details only in the server log)
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  // 1. Idempotency key: the same key + same body never creates two orders
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyKeySchema.safeParse(idempotencyKey).success) {
    return jsonError(400, "INVALID_IDEMPOTENCY_KEY", "חסרה כותרת Idempotency-Key תקינה (UUID חדש לכל הזמנה)", {
      requestId,
    });
  }

  // 2. Optional sign-in
  const authorization = request.headers.get("authorization");
  let accessToken: string | null = null;
  if (authorization !== null) {
    const match = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/.exec(authorization.trim());
    if (!match) return jsonError(401, "UNAUTHORIZED", "כותרת Authorization אינה תקינה", { requestId });
    accessToken = match[1];
  }

  // 3. Body: JSON, size-limited
  const body = await readJsonBody(request, MAX_ORDER_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.code, body.message, { requestId });

  // 4. Strict validation (types, limits, no unknown fields)
  const parsed = createOrderSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(422, "VALIDATION_FAILED", "נתוני ההזמנה אינם תקינים", {
      requestId,
      details: { fields: toFieldErrors(parsed.error) },
    });
  }

  // 5. Create the order in the database (one transaction)
  try {
    const outcome = await createOrder(parsed.data, { accessToken, idempotencyKey });

    if (outcome.ok) {
      return jsonResponse({ order: outcome.order } satisfies { order: OrderConfirmation }, {
        status: 201,
        requestId,
        headers: outcome.replayed ? { "Idempotent-Replayed": "true" } : undefined,
      });
    }

    const { failure } = outcome;
    if (failure.internal !== undefined) logServerError(requestId, `create_order failed (${failure.code})`, failure.internal);
    return jsonError(failure.status, failure.code, failure.message, {
      requestId,
      details: failure.details,
      headers: failure.retryAfterSeconds ? { "Retry-After": String(failure.retryAfterSeconds) } : undefined,
    });
  } catch (error) {
    logServerError(requestId, "POST /api/orders", error);
    if (error instanceof SupabaseConfigError || error instanceof ServiceRoleNotConfiguredError) {
      return jsonError(503, "SERVICE_UNAVAILABLE", "ההזמנות אינן זמינות כרגע", { requestId });
    }
    return jsonError(500, "INTERNAL_ERROR", "אירעה שגיאה בעיבוד ההזמנה", { requestId });
  }
}
