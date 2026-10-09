import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------
// Fake database layer: records what would be sent to create_order().
// (The real function is tested in supabase/tests/order_processing.test.sql.)
// ---------------------------------------------------------------------
const userRpc = vi.fn();
const serverRpc = vi.fn();
const createUserClient = vi.fn(() => ({ rpc: userRpc }));

vi.mock("@/lib/supabase", () => ({
  createUserClient,
  SupabaseConfigError: class SupabaseConfigError extends Error {},
}));
vi.mock("@/lib/supabase-admin", () => ({
  createOrderAsServer: serverRpc,
  ServiceRoleNotConfiguredError: class ServiceRoleNotConfiguredError extends Error {},
}));

const { POST } = await import("@/app/api/orders/route");
const { ServiceRoleNotConfiguredError } = await import("@/lib/supabase-admin");

const KEY = "3f1c2a9e-4b7d-4e2a-9c1f-0a1b2c3d4e5f";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.signature-part";

function validBody() {
  return {
    customer: { fullName: "דנה כהן", phone: "050-123-4567", city: "תל אביב", address: "הרצל 10" },
    items: [
      { productId: 1, quantity: 3 },
      { productId: 21, quantity: 2 },
    ],
  };
}

function post(
  body: unknown,
  { key = KEY, token, contentType = "application/json" }: { key?: string | null; token?: string; contentType?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": contentType };
  if (key !== null) headers["idempotency-key"] = key;
  if (token) headers.authorization = `Bearer ${token}`;
  return POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/** What create_order() returns on success (prices come from the DB). */
function dbOrder(replayed = false) {
  return {
    data: {
      order_id: 42,
      status: "pending",
      total_amount: 100.5,
      created_at: "2026-10-09T09:00:00Z",
      replayed,
      items: [
        { product_id: 1, product_name: "חלב 3%", quantity: 3, unit_price: 6.9, line_total: 20.7 },
        { product_id: 21, product_name: "שמן זית", quantity: 2, unit_price: 39.9, line_total: 79.8 },
      ],
    },
    error: null,
  };
}

function dbError(code: string, message: string, details: object | string | null = null) {
  return {
    data: null,
    error: { code, message, details: typeof details === "string" || details === null ? details : JSON.stringify(details), hint: null },
  };
}

beforeEach(() => {
  userRpc.mockReset();
  serverRpc.mockReset();
  createUserClient.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// =====================================================================
// The five required scenarios
// =====================================================================
describe("required scenarios", () => {
  it("successful order creation -> 201 with the DB-calculated order", async () => {
    serverRpc.mockResolvedValue(dbOrder());
    const response = await post(validBody());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.order).toEqual({
      orderId: 42,
      status: "pending",
      totalAmount: 100.5,
      createdAt: "2026-10-09T09:00:00Z",
      items: [
        { productId: 1, productName: "חלב 3%", quantity: 3, unitPrice: 6.9, lineTotal: 20.7 },
        { productId: 21, productName: "שמן זית", quantity: 2, unitPrice: 39.9, lineTotal: 79.8 },
      ],
    });
    // Exactly what reached the DB: normalized customer + ids/quantities only
    expect(serverRpc).toHaveBeenCalledWith({
      p_customer: { full_name: "דנה כהן", phone: "0501234567", email: null, city: "תל אביב", address: "הרצל 10", notes: null },
      p_items: [
        { product_id: 1, quantity: 3 },
        { product_id: 21, quantity: 2 },
      ],
      p_idempotency_key: KEY,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("nonexistent product -> 422 PRODUCT_NOT_FOUND", async () => {
    serverRpc.mockResolvedValue(dbError("P0001", "PRODUCT_NOT_FOUND", { product_id: 999999 }));
    const body = validBody();
    body.items = [{ productId: 999999, quantity: 1 }];

    const response = await post(body);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(json.error.details).toEqual({ productId: 999999 });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["above 100", 101],
    ["fraction", 1.5],
    ["string", "2"],
    ["null", null],
  ])("invalid quantity (%s) -> 422 before touching the DB", async (_label, quantity) => {
    const response = await post({ ...validBody(), items: [{ productId: 1, quantity }] });
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(json.error.details.fields[0].field).toBe("items.0.quantity");
    expect(serverRpc).not.toHaveBeenCalled();
  });

  it("insufficient inventory -> 409 INSUFFICIENT_STOCK with requested/available", async () => {
    serverRpc.mockResolvedValue(
      dbError("P0001", "INSUFFICIENT_STOCK", { product_id: 21, product_name: "שמן זית", requested: 31, available: 30 }),
    );
    const response = await post(validBody());
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error.code).toBe("INSUFFICIENT_STOCK");
    expect(json.error.details).toEqual({ productId: 21, requested: 31, available: 30 });
    expect(json.error.message).toContain("זמינים 30");
  });

  it.each([
    ["price on an item", { items: [{ productId: 1, quantity: 1, price: 0.01 }] }, "items.0.price"],
    ["unitPrice on an item", { items: [{ productId: 1, quantity: 1, unitPrice: 0 }] }, "items.0.unitPrice"],
    ["total on the order", { total: 0.01 }, "total"],
    ["totalAmount on the order", { totalAmount: 1 }, "totalAmount"],
  ])("forged price (%s) -> 422, nothing sent to the DB", async (_label, forged, field) => {
    const response = await post({ ...validBody(), ...forged });
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.details.fields).toContainEqual({ field, message: "שדה לא מוכר" });
    expect(serverRpc).not.toHaveBeenCalled();
    expect(userRpc).not.toHaveBeenCalled();
  });
});

// =====================================================================
// Request validation
// =====================================================================
describe("request validation", () => {
  it("requires an Idempotency-Key header (UUID)", async () => {
    expect((await post(validBody(), { key: null })).status).toBe(400);
    expect((await post(validBody(), { key: "not-a-uuid" })).status).toBe(400);
    expect(serverRpc).not.toHaveBeenCalled();
  });

  it("requires JSON content type", async () => {
    const response = await post(validBody(), { contentType: "text/plain" });
    expect(response.status).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    const response = await post("{oops");
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
  });

  it("rejects bodies over 16 KB", async () => {
    const response = await post({ ...validBody(), padding: "x".repeat(20_000) });
    expect(response.status).toBe(413);
  });

  it("rejects payment data in customer details", async () => {
    const body = validBody();
    const response = await post({ ...body, customer: { ...body.customer, cardNumber: "4111111111111111" } });
    expect(response.status).toBe(422);
    expect((await response.json()).error.details.fields).toContainEqual({ field: "customer.cardNumber", message: "שדה לא מוכר" });
  });

  it.each([
    ["invalid phone", { phone: "12345" }, "customer.phone"],
    ["name too short", { fullName: "א" }, "customer.fullName"],
    ["missing city", { city: undefined }, "customer.city"],
    ["invalid email", { email: "not-an-email" }, "customer.email"],
    ["control characters", { address: "הרצל\u0000 10" }, "customer.address"],
  ])("customer: %s -> 422", async (_label, change, field) => {
    const body = validBody();
    const response = await post({ ...body, customer: { ...body.customer, ...change } });
    expect(response.status).toBe(422);
    const fields = (await response.json()).error.details.fields.map((f: { field: string }) => f.field);
    expect(fields).toContain(field);
  });

  it("accepts +972 phone numbers and optional empty email", async () => {
    serverRpc.mockResolvedValue(dbOrder());
    const body = validBody();
    await post({ ...body, customer: { ...body.customer, phone: "+972 50-123-4567", email: "" } });
    expect(serverRpc.mock.calls[0][0].p_customer).toMatchObject({ phone: "0501234567", email: null });
  });

  it.each([
    ["empty order", []],
    ["51 lines", Array.from({ length: 51 }, (_, i) => ({ productId: i + 1, quantity: 1 }))],
    ["duplicate product", [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }]],
    ["more than 500 units", Array.from({ length: 6 }, (_, i) => ({ productId: i + 1, quantity: 100 }))],
    ["string productId", [{ productId: "1", quantity: 1 }]],
  ])("items: %s -> 422", async (_label, items) => {
    const response = await post({ ...validBody(), items });
    expect(response.status).toBe(422);
    expect(serverRpc).not.toHaveBeenCalled();
  });
});

// =====================================================================
// Duplicates, concurrency, auth, failures
// =====================================================================
describe("duplicates and concurrency", () => {
  it("a repeated request returns the same order with Idempotent-Replayed", async () => {
    serverRpc.mockResolvedValue(dbOrder(true));
    const response = await post(validBody());
    expect(response.status).toBe(201);
    expect(response.headers.get("idempotent-replayed")).toBe("true");
    expect((await response.json()).order.orderId).toBe(42);
  });

  it("same key with a different order -> 422 IDEMPOTENCY_KEY_REUSED", async () => {
    serverRpc.mockResolvedValue(dbError("P0001", "IDEMPOTENCY_KEY_REUSED", {}));
    const response = await post(validBody());
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it.each(["55P03", "40P01", "40001"])("lock/serialization conflict %s -> 409 with Retry-After", async (code) => {
    serverRpc.mockResolvedValue(dbError(code, "canceling statement due to lock timeout"));
    const response = await post(validBody());
    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("1");
    expect((await response.json()).error.code).toBe("CONFLICT_RETRY");
  });
});

describe("authentication paths", () => {
  it("signed-in: uses the customer's token (RLS applies), not the service role", async () => {
    userRpc.mockResolvedValue(dbOrder());
    const response = await post(validBody(), { token: TOKEN });
    expect(response.status).toBe(201);
    expect(createUserClient).toHaveBeenCalledWith(TOKEN);
    expect(userRpc).toHaveBeenCalledWith("create_order", expect.any(Object));
    expect(serverRpc).not.toHaveBeenCalled();
  });

  it("guest: uses the server-only path", async () => {
    serverRpc.mockResolvedValue(dbOrder());
    await post(validBody());
    expect(serverRpc).toHaveBeenCalledTimes(1);
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it("malformed Authorization header -> 401", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": KEY, authorization: "Basic abc" },
        body: JSON.stringify(validBody()),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("expired token reported by the DB -> 401", async () => {
    userRpc.mockResolvedValue(dbError("PGRST301", "JWT expired"));
    expect((await post(validBody(), { token: TOKEN })).status).toBe(401);
  });
});

describe("errors never leak internals", () => {
  it("unknown DB error -> generic 500 without the raw message", async () => {
    serverRpc.mockResolvedValue(dbError("XX000", 'relation "secret_internal_table" does not exist at line 42'));
    const response = await post(validBody());
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toMatch(/secret_internal_table|line 42|XX000/);
    expect(JSON.parse(text).error).toMatchObject({ code: "INTERNAL_ERROR", requestId: expect.any(String) });
  });

  it("thrown exception -> 500 without stack trace", async () => {
    serverRpc.mockRejectedValue(new Error("boom at /srv/app/lib/orders.ts:12"));
    const text = await (await post(validBody())).text();
    expect(text).not.toMatch(/boom|orders\.ts|stack/);
  });

  it("database unreachable -> 503", async () => {
    serverRpc.mockResolvedValue(dbError("", "TypeError: fetch failed"));
    expect((await post(validBody())).status).toBe(503);
  });

  it("service role key not configured -> 503 (guest checkout disabled)", async () => {
    serverRpc.mockRejectedValue(new ServiceRoleNotConfiguredError());
    const response = await post(validBody());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("DB detail fields are filtered to plain values", async () => {
    serverRpc.mockResolvedValue(
      dbError("P0001", "INSUFFICIENT_STOCK", { product_id: 1, product_name: "x", requested: 2, available: 1, sql: { q: "select" } }),
    );
    const json = await (await post(validBody())).json();
    expect(JSON.stringify(json)).not.toContain("select");
  });
});
