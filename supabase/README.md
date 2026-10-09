# Database (Supabase / PostgreSQL)

Run these in the Supabase **SQL Editor**, in this order (each file is safe to re-run):

| # | File | What it does |
|---|------|--------------|
| 1 | `schema.sql` | Tables, constraints, indexes, RLS, base privileges |
| 2 | `migrations/002_order_processing.sql` | Customer details + guest orders + idempotency key on `orders`; the `create_order()` transaction function |
| 3 | `seed.sql` | 5 categories, 25 sample products |
| 4 | `verify.sql` | Read-only checks — every row should say `true` |
| 5 | `tests/order_processing.test.sql` | Tests for `create_order()` — every row should say `PASS`. Rolls everything back; your data is not changed |

## How an order is created

`POST /api/orders` → validates the request → calls `create_order(customer, items, idempotency_key)`.

Inside `create_order`, in **one transaction**:

1. Check the caller (signed-in customer, or the server's service role for guests).
2. Validate customer details and items (types, 1–100 per product, ≤ 50 lines, ≤ 500 units).
3. Take an advisory lock on the idempotency key. If an order with that key exists, return it
   (same request) or fail with `IDEMPOTENCY_KEY_REUSED` (different request).
4. `SELECT … FOR UPDATE` the products, in id order (prevents deadlocks).
5. Check each product exists, is available and has enough stock.
6. Insert the order, insert the items with `unit_price` copied from `products.price`,
   decrement stock, compute the total from the line totals.

Any error at any step rolls back the whole transaction — there is never a half-created order.
