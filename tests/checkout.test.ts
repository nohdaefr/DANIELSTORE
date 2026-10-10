import { describe, expect, it } from "vitest";
import {
  buildOrderRequest,
  EMPTY_CUSTOMER_FORM,
  interpretOrderResponse,
  newIdempotencyKey,
  orderFingerprint,
  validateCustomer,
} from "@/lib/checkout";

const FORM = {
  ...EMPTY_CUSTOMER_FORM,
  fullName: " ישראל ישראלי ",
  phone: "050-123 4567",
  city: "חיפה",
  address: "הרצל 1",
};

const ORDER = {
  orderId: 17,
  status: "pending",
  totalAmount: 25.8,
  createdAt: "2026-10-10T10:00:00Z",
  items: [{ productId: 1, productName: "חלב", quantity: 2, unitPrice: 6.9, lineTotal: 13.8 }],
};

describe("validateCustomer", () => {
  it("accepts valid details and normalizes them like the server", () => {
    const result = validateCustomer(FORM);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.customer.fullName).toBe("ישראל ישראלי");
      expect(result.customer.phone).toBe("0501234567");
      expect(result.customer.email).toBeUndefined();
      expect(result.customer.notes).toBeUndefined();
    }
  });

  it("reports one Hebrew message per invalid field", () => {
    const result = validateCustomer({ ...EMPTY_CUSTOMER_FORM, phone: "123", email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(["address", "city", "email", "fullName", "phone"]);
      expect(result.fieldErrors.phone).toMatch(/טלפון/);
    }
  });
});

describe("order request", () => {
  it("contains only ids and quantities — no prices or totals", () => {
    const result = validateCustomer(FORM);
    if (!result.ok) throw new Error("form should be valid");
    const lines = [{ productId: 3, quantity: 2, price: 0.01 } as { productId: number; quantity: number }];
    const request = buildOrderRequest(result.customer, lines);
    expect(request.items).toEqual([{ productId: 3, quantity: 2 }]);
    expect(JSON.stringify(request)).not.toMatch(/price|total/i);
  });

  it("fingerprint ignores item order but changes with content", () => {
    const result = validateCustomer(FORM);
    if (!result.ok) throw new Error("form should be valid");
    const a = buildOrderRequest(result.customer, [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 3 },
    ]);
    const b = buildOrderRequest(result.customer, [
      { productId: 2, quantity: 3 },
      { productId: 1, quantity: 1 },
    ]);
    const c = buildOrderRequest(result.customer, [{ productId: 1, quantity: 2 }]);
    expect(orderFingerprint(a)).toBe(orderFingerprint(b));
    expect(orderFingerprint(a)).not.toBe(orderFingerprint(c));
  });

  it("idempotency keys are fresh UUIDs", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });
});

describe("interpretOrderResponse", () => {
  it("201 -> success with the server's order", () => {
    expect(interpretOrderResponse(201, { order: ORDER })).toEqual({ kind: "success", order: ORDER });
  });

  it("201 with a malformed body is not treated as success", () => {
    expect(interpretOrderResponse(201, { order: { orderId: "x" } }).kind).toBe("error");
    expect(interpretOrderResponse(201, null).kind).toBe("error");
  });

  it("422 VALIDATION_FAILED -> errors mapped to the form fields", () => {
    const outcome = interpretOrderResponse(422, {
      error: {
        code: "VALIDATION_FAILED",
        message: "x",
        requestId: "r",
        details: { fields: [{ field: "customer.phone", message: "טלפון: מספר ישראלי לא תקין" }] },
      },
    });
    expect(outcome).toMatchObject({ kind: "fields", fieldErrors: { phone: "טלפון: מספר ישראלי לא תקין" } });
  });

  it("409 INSUFFICIENT_STOCK -> stock problem with the available amount", () => {
    const outcome = interpretOrderResponse(409, {
      error: { code: "INSUFFICIENT_STOCK", message: "אין מספיק מלאי", requestId: "r", details: { productId: 4, requested: 9, available: 2 } },
    });
    expect(outcome).toEqual({ kind: "stock", message: "אין מספיק מלאי", productId: 4, available: 2 });
  });

  it("503 -> friendly 'orders unavailable' message", () => {
    const outcome = interpretOrderResponse(503, { error: { code: "SERVICE_UNAVAILABLE", message: "x", requestId: "r" } });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.message).toMatch(/אינן זמינות/);
  });

  it("unknown / non-JSON error bodies -> generic Hebrew message", () => {
    const outcome = interpretOrderResponse(500, "<html>");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.message).toMatch(/נסו שוב/);
  });
});
