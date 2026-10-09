import { z } from "zod";

// Must match the limits in supabase/schema.sql and create_order()
export const MAX_QUANTITY_PER_PRODUCT = 100;
export const MAX_ORDER_LINES = 50;
export const MAX_UNITS_PER_ORDER = 500;
export const MAX_SEARCH_LENGTH = 60;
export const MAX_ORDER_BODY_BYTES = 16 * 1024;

// Up to 15 digits — the same limit create_order() accepts.
const positiveId = z.number().int().positive().max(999_999_999_999_999);
const quantity = z.number().int().min(1).max(MAX_QUANTITY_PER_PRODUCT);

// ---------------------------------------------------------------------
// Rows coming back from Supabase. Validated at runtime so a schema
// change shows up as a clear error instead of `undefined` in the UI.
// NUMERIC may arrive as a number or a string, so it is coerced.
// ---------------------------------------------------------------------
export const categoryRowSchema = z.object({
  id: positiveId,
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const productRowSchema = z.object({
  id: positiveId,
  category_id: positiveId,
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  unit: z.string().min(1),
  price: z.coerce.number().positive(),
  stock_quantity: z.number().int().min(0),
  image_url: z.url({ protocol: /^https?$/ }).nullable(),
});

export type CategoryRow = z.infer<typeof categoryRowSchema>;
export type ProductRow = z.infer<typeof productRowSchema>;

// ---------------------------------------------------------------------
// Storefront URL: ?q=...&category=...
// Anything invalid is ignored rather than causing an error page.
// ---------------------------------------------------------------------
/** Removes characters that have special meaning in LIKE / PostgREST filters. */
export function sanitizeSearch(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[%_*\\,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseCatalogFilters(
  params: Record<string, string | string[] | undefined>,
): { query: string; categorySlug: string | null } {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const category = first(params.category);
  return {
    query: sanitizeSearch(first(params.q)),
    categorySlug: category && slugPattern.test(category) ? category : null,
  };
}

// ---------------------------------------------------------------------
// GET /api/products?ids=1,2,3
// ---------------------------------------------------------------------
export function parseProductIds(raw: string | null): number[] | null {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length === 0 || parts.length > MAX_ORDER_LINES) return null;
  const ids: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,15}$/.test(part)) return null;
    const id = Number(part);
    if (!positiveId.safeParse(id).success) return null;
    ids.push(id);
  }
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------
// GET /api/products — query string
// ---------------------------------------------------------------------
export type ProductsQuery =
  | { kind: "ids"; ids: number[] }
  | { kind: "filters"; query: string; categorySlug: string | null };

export function parseProductsQuery(params: URLSearchParams): ProductsQuery | { error: string } {
  const allowed = new Set(["ids", "q", "category"]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) return { error: `פרמטר לא מוכר: ${key}` };
  }
  if (params.has("ids")) {
    if (params.has("q") || params.has("category")) return { error: "אי אפשר לשלב ids עם q או category" };
    const ids = parseProductIds(params.get("ids"));
    return ids ? { kind: "ids", ids } : { error: `ids חייב להיות רשימה של עד ${MAX_ORDER_LINES} מספרים חיוביים` };
  }
  const category = params.get("category");
  if (category !== null && !slugPattern.test(category)) return { error: "category לא תקין" };
  const rawQuery = params.get("q") ?? "";
  if (rawQuery.length > 200) return { error: "q ארוך מדי" };
  return { kind: "filters", query: sanitizeSearch(rawQuery), categorySlug: category };
}

// ---------------------------------------------------------------------
// POST /api/orders — strict: unknown fields (price, total, card numbers...)
// are REJECTED, not ignored. Same rules as create_order() in the DB.
// ---------------------------------------------------------------------
const PHONE_PATTERN = /^0(5\d{8}|7\d{8}|[2-489]\d{7})$/;

/** "050-123 4567" / "+972 50 1234567" -> "0501234567" */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(/[\s().-]/g, "");
  return compact.startsWith("+972") ? `0${compact.slice(4)}` : compact;
}

function hasControlChars(value: string, allowNewlines = false): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isNewline = code === 9 || code === 10 || code === 13;
    if ((code < 32 && !(allowNewlines && isNewline)) || code === 127) return true;
  }
  return false;
}

function requiredText(label: string, min: number, max: number) {
  return z
    .string({ error: `${label}: שדה חובה` })
    .trim()
    .min(min, { error: `${label}: לפחות ${min} תווים` })
    .max(max, { error: `${label}: עד ${max} תווים` })
    .refine((v) => !hasControlChars(v), { error: `${label}: מכיל תווים לא חוקיים` });
}

const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

export const customerSchema = z.strictObject(
  {
    fullName: requiredText("שם מלא", 2, 80),
    phone: z
      .string({ error: "טלפון: שדה חובה" })
      .transform(normalizePhone)
      .pipe(z.string().regex(PHONE_PATTERN, { error: "טלפון: מספר ישראלי לא תקין" })),
    email: z.preprocess(
      emptyToUndefined,
      z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "אימייל: כתובת לא תקינה" })).optional(),
    ),
    city: requiredText("עיר", 2, 60),
    address: requiredText("כתובת", 2, 120),
    notes: z.preprocess(
      emptyToUndefined,
      z
        .string({ error: "הערות: חייב להיות טקסט" })
        .trim()
        .max(300, { error: "הערות: עד 300 תווים" })
        .refine((v) => !hasControlChars(v, true), { error: "הערות: מכיל תווים לא חוקיים" })
        .optional(),
    ),
  },
  { error: "פרטי לקוח: נדרש אובייקט" },
);

export const orderItemSchema = z.strictObject({
  productId: positiveId,
  quantity: z
    .number({ error: "כמות: חייבת להיות מספר" })
    .int({ error: "כמות: חייבת להיות מספר שלם" })
    .min(1, { error: "כמות: לפחות 1" })
    .max(MAX_QUANTITY_PER_PRODUCT, { error: `כמות: עד ${MAX_QUANTITY_PER_PRODUCT} לכל מוצר` }),
});

export const createOrderSchema = z.strictObject({
  customer: customerSchema,
  items: z
    .array(orderItemSchema, { error: "items: נדרשת רשימת מוצרים" })
    .min(1, { error: "ההזמנה ריקה" })
    .max(MAX_ORDER_LINES, { error: `עד ${MAX_ORDER_LINES} מוצרים שונים בהזמנה` })
    .superRefine((items, ctx) => {
      const seen = new Set<number>();
      items.forEach((item, index) => {
        if (seen.has(item.productId)) {
          ctx.addIssue({ code: "custom", path: [index, "productId"], message: "המוצר מופיע יותר מפעם אחת" });
        }
        seen.add(item.productId);
      });
      const units = items.reduce((sum, item) => sum + item.quantity, 0);
      if (units > MAX_UNITS_PER_ORDER) {
        ctx.addIssue({ code: "custom", path: [], message: `עד ${MAX_UNITS_PER_ORDER} יחידות בהזמנה` });
      }
    }),
});

export type ValidCreateOrder = z.output<typeof createOrderSchema>;

export const idempotencyKeySchema = z.uuid();

export interface FieldError {
  field: string;
  message: string;
}

/** zod issues -> [{ field: "items.0.quantity", message: "..." }] (safe to return to clients) */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.flatMap((issue) => {
    const base = issue.path.map(String).join(".");
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({ field: base ? `${base}.${key}` : key, message: "שדה לא מוכר" }));
    }
    return [{ field: base || "(body)", message: issue.message }];
  });
}

// ---------------------------------------------------------------------
// Cart saved in localStorage. Invalid lines are dropped, never trusted.
// ---------------------------------------------------------------------
export const cartLineSchema = z.object({ productId: positiveId, quantity });

export const storedCartSchema = z.object({
  version: z.literal(1),
  lines: z.array(z.unknown()),
});
