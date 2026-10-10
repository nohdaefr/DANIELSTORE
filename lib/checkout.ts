// Client-side checkout helpers (pure functions, no React, no secrets).
// The browser sends ONLY product ids, quantities and delivery details.
// Prices and the total always come back from the server/database.
import { customerSchema } from "@/lib/validation";
import type { CartLine, CreateOrderRequest, CustomerDetails, OrderConfirmation } from "@/types";

export type CustomerField = "fullName" | "phone" | "email" | "city" | "address" | "notes";
export type CustomerForm = Record<CustomerField, string>;
export type FieldErrors = Partial<Record<CustomerField, string>>;

export const EMPTY_CUSTOMER_FORM: CustomerForm = {
  fullName: "",
  phone: "",
  email: "",
  city: "",
  address: "",
  notes: "",
};

export const CUSTOMER_FIELDS: readonly CustomerField[] = ["fullName", "phone", "email", "city", "address", "notes"];

const isCustomerField = (value: string): value is CustomerField => (CUSTOMER_FIELDS as readonly string[]).includes(value);

/** Same rules as the server (lib/validation.ts). The server validates again anyway. */
export function validateCustomer(
  form: CustomerForm,
): { ok: true; customer: CustomerDetails } | { ok: false; fieldErrors: FieldErrors } {
  const parsed = customerSchema.safeParse(form);
  if (parsed.success) return { ok: true, customer: parsed.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (isCustomerField(field) && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}

/** Request body: ids + quantities only. Never prices or totals. */
export function buildOrderRequest(customer: CustomerDetails, lines: readonly CartLine[]): CreateOrderRequest {
  return {
    customer,
    items: lines.map(({ productId, quantity }) => ({ productId, quantity })),
  };
}

/**
 * Identifies "the same order attempt". While it doesn't change, retries reuse
 * the same Idempotency-Key, so a double click or a retry after a network
 * error can never create two orders.
 */
export function orderFingerprint(request: CreateOrderRequest): string {
  const items = [...request.items].sort((a, b) => a.productId - b.productId);
  return JSON.stringify({ customer: request.customer, items });
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export type SubmitOutcome =
  | { kind: "success"; order: OrderConfirmation }
  /** invalid delivery details — shown next to the fields */
  | { kind: "fields"; fieldErrors: FieldErrors; message: string }
  /** stock/availability changed — prices are reloaded; may offer a fix */
  | { kind: "stock"; message: string; productId?: number; available?: number }
  /** anything else — a message to show; trying again is safe (same key) */
  | { kind: "error"; message: string };

const GENERIC_ERROR = "לא הצלחנו לשלוח את ההזמנה. נסו שוב בעוד רגע.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOrderConfirmation(value: unknown): value is OrderConfirmation {
  return (
    isRecord(value) &&
    typeof value.orderId === "number" &&
    typeof value.totalAmount === "number" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.items)
  );
}

/** Turns the HTTP status + JSON body of POST /api/orders into something the UI can show. */
export function interpretOrderResponse(status: number, body: unknown): SubmitOutcome {
  if (status === 201 || status === 200) {
    const order = isRecord(body) ? body.order : undefined;
    return isOrderConfirmation(order) ? { kind: "success", order } : { kind: "error", message: GENERIC_ERROR };
  }

  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" && error.message ? error.message : GENERIC_ERROR;
  const details = isRecord(error?.details) ? error.details : {};

  switch (code) {
    case "VALIDATION_FAILED": {
      const fieldErrors: FieldErrors = {};
      const fields = Array.isArray(details.fields) ? details.fields : [];
      for (const entry of fields) {
        if (!isRecord(entry) || typeof entry.field !== "string" || typeof entry.message !== "string") continue;
        const field = entry.field.replace(/^customer\./, "");
        if (isCustomerField(field) && !fieldErrors[field]) fieldErrors[field] = entry.message;
      }
      return Object.keys(fieldErrors).length > 0
        ? { kind: "fields", fieldErrors, message: "יש לתקן את השדות המסומנים" }
        : { kind: "error", message };
    }
    case "INSUFFICIENT_STOCK":
    case "PRODUCT_UNAVAILABLE":
    case "PRODUCT_NOT_FOUND":
      return {
        kind: "stock",
        message,
        productId: typeof details.productId === "number" ? details.productId : undefined,
        available: typeof details.available === "number" ? details.available : undefined,
      };
    case "SERVICE_UNAVAILABLE":
      return { kind: "error", message: "ההזמנות אינן זמינות כרגע. העגלה שמורה — נסו שוב מאוחר יותר." };
    default:
      return { kind: "error", message };
  }
}
