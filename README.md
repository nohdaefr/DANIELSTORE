# סופר שכונתי — Online grocery store (learning project)

A Hebrew, right-to-left online supermarket built with **Next.js 16 (App Router, TypeScript)**, **React 19** and **Supabase (PostgreSQL)**.

- Product catalog with search and categories, loaded from the database on the server
- Shopping cart saved in `localStorage` (ids + quantities only — never prices)
- `GET /api/products` and `POST /api/orders` route handlers
- Orders are priced, stock-checked and saved by one atomic SQL function (`create_order`)
- Row Level Security on every table; the privileged key is server-only
- **No payments.** This project never accepts or stores payment details.

---

## 1. Project structure

```
app/
  page.tsx                 Storefront (search, categories, products) — server component
  cart/page.tsx            Cart page
  api/products/route.ts    GET  /api/products
  api/orders/route.ts      POST /api/orders
  error.tsx, not-found.tsx, global-error.tsx   Hebrew error pages
components/                UI components (ProductCard, PriceTag, cart/…)
lib/
  catalog.ts               Reads categories/products (anon role, RLS applies)
  orders.ts                Calls create_order(), maps DB errors to safe HTTP errors
  supabase.ts              Public/anon + signed-in user clients (server-only)
  supabase-admin.ts        The ONLY use of the service key: guest create_order() (server-only)
  env-guard.ts             Refuses secrets in NEXT_PUBLIC_ variables (build + runtime)
  validation.ts            zod schemas shared by the API
  cart.ts, cart-store.ts   Cart logic + localStorage store
supabase/
  schema.sql                           Tables, constraints, RLS, privileges
  migrations/002_order_processing.sql  Customer details, idempotency, create_order()
  seed.sql                             5 categories, 25 products
  verify.sql                           Read-only checks (all rows must be true)
  tests/order_processing.test.sql      SQL tests (roll themselves back)
tests/                     Unit tests (Vitest), incl. static security checks
scripts/check-env.mts      `npm run check:env` — validates env + live Supabase checks
```

---

## 2. Running locally

### Prerequisites
- Node.js **20.9 or newer** (developed with Node 24) and npm
- A free Supabase project — https://supabase.com

### Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create the database** — Supabase Dashboard → **SQL Editor**, run each file (copy, paste, Run) in this order:
   1. `supabase/schema.sql`
   2. `supabase/migrations/002_order_processing.sql`
   3. `supabase/seed.sql`
   4. `supabase/verify.sql` → every row must show `true`
   5. `supabase/tests/order_processing.test.sql` → every row must show `PASS` (changes nothing)

3. **Configure environment variables** — see [section 5](#5-environment-variables-and-secrets). In short:
   ```powershell
   Copy-Item .env.example .env.local   # then edit .env.local in VS Code
   npm run check:env                   # verifies everything without printing any key
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / run it |
| `npm test` | Unit tests (Vitest) — no database needed |
| `npm run typecheck` | TypeScript (run `npx next typegen` first on a fresh clone) |
| `npm run lint` | ESLint |
| `npm run check:env` | Validates `.env.local` and the live Supabase connection (never prints keys; Node 22.18+) |

### Quick API check (PowerShell)
```powershell
Invoke-RestMethod http://localhost:3000/api/products
$body = [Text.Encoding]::UTF8.GetBytes('{"customer":{"fullName":"דנה כהן","phone":"0501234567","city":"תל אביב","address":"הרצל 10"},"items":[{"productId":1,"quantity":2}]}')
Invoke-RestMethod http://localhost:3000/api/orders -Method Post -ContentType "application/json; charset=utf-8" -Headers @{ "Idempotency-Key" = [guid]::NewGuid() } -Body $body
```

---

## 3. API

### `GET /api/products`
`?q=` search · `?category=<slug>` · `?ids=1,2,3` (max 50). Returns `{ products, count }`.

### `POST /api/orders`
Headers: `Content-Type: application/json`, `Idempotency-Key: <new UUID per checkout>`, optional `Authorization: Bearer <Supabase access token>`.

```json
{ "customer": { "fullName": "…", "phone": "050-1234567", "city": "…", "address": "…", "email": "optional", "notes": "optional" },
  "items": [{ "productId": 1, "quantity": 2 }] }
```

Only these fields are accepted — prices, totals and payment data are rejected (422). The database reads prices, checks stock and computes the total inside one transaction.

| Status | Code |
|---|---|
| 201 | Created (same key + same body again → same order, header `Idempotent-Replayed: true`) |
| 400 | `INVALID_JSON`, `INVALID_IDEMPOTENCY_KEY` |
| 401 | `UNAUTHORIZED` |
| 409 | `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, `CONFLICT_RETRY` (+ `Retry-After`) |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_FAILED`, `PRODUCT_NOT_FOUND`, `IDEMPOTENCY_KEY_REUSED` |
| 500 / 503 | `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE` — details only in the server log, matched by `requestId` |

---

## 4. Deploying a demo (Vercel + Supabase)

### 4.1 Supabase
1. Create a **separate** Supabase project for the demo (don't reuse your development data).
2. Run the SQL files from step 2 above, in order, and confirm `verify.sql` and the SQL tests pass.
3. **Settings → API Keys**: create a publishable key and a secret key. If you only use the new keys, you can disable the legacy `anon`/`service_role` keys.
4. Security hardening (Supabase production checklist):
   - **Security Advisor**: resolve any warnings.
   - **Database → Settings → SSL Configuration**: enable SSL enforcement.
   - **Database → Settings → Network Restrictions**: enable if you connect to the database directly (the app itself only uses the HTTPS API).
   - Enable **MFA** on your Supabase account.
   - Confirm RLS is on for all four tables (`verify.sql` checks this).

### 4.2 Vercel
1. Push the project to a GitHub repository (check first: `git status` must **not** list `.env.local`).
2. In Vercel: **Add New → Project**, import the repository. Framework: Next.js (detected automatically).
3. **Settings → Environment Variables** (details in section 5.3):

   | Key | Type | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Config | Production, Preview |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Production, Preview |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Production only (see below) |

   - Never create a `NEXT_PUBLIC_…SERVICE…` / `…SECRET…` variable — the build stops with an error if you do.
   - Leaving `SUPABASE_SERVICE_ROLE_KEY` out of Preview means preview deployments can't create guest orders.
4. Deploy, then open the site and check: products load, cart persists after refresh, `/api/products` returns JSON.

### 4.3 Security settings already in the code
- Security headers on every response: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'…`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; `X-Powered-By` is removed.
- API errors never include database messages or stack traces.
- `server-only` imports make the build fail if a client component imports a file that uses keys.

### 4.4 Before making the demo public
- **Rate limiting**: `POST /api/orders` has none. Anyone could place many guest orders and use up the demo stock. Either leave `SUPABASE_SERVICE_ROLE_KEY` unset (no guest orders), or add a rate-limit rule on `/api/orders` in your hosting platform's firewall.
- **Accessibility statement**: a public Israeli website offering services is generally expected to meet IS 5568 (based on WCAG) and publish a הצהרת נגישות. Check the current requirements if this becomes more than a demo.
- If a key ever leaks, follow section 5.5.

---

## 5. Environment variables and secrets

### 5.1 The three variables

| Variable | Kind | Where it is used | In the browser? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | server code (`lib/supabase.ts`), `next.config.ts` | allowed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — **use the publishable key** `sb_publishable_…` (legacy `anon` JWT also accepted) | server code (`lib/supabase.ts`) | allowed — RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** — secret key `sb_secret_…` (legacy `service_role` JWT also accepted) | **only** `lib/supabase-admin.ts`, for guest `create_order()` | **never** |

How this is enforced:
- `server-only` imports: the build fails if a client component imports a module that reads keys.
- `next.config.ts` refuses to build if any `NEXT_PUBLIC_*` variable is named like, or contains, a secret key.
- At runtime the public variable must hold a publishable/anon key and the secret variable a secret/service_role key; placeholders count as "not configured".
- Server logs are passed through `redactSecrets()` — keys, JWTs and bearer tokens become `[REDACTED]`.
- `tests/security-static.test.ts` fails if the secret is read anywhere else, if a client component reads `process.env`, or if `.env.example` contains anything but placeholders.
- API responses contain only error codes, safe messages and a request id.

### 5.2 Local setup (step by step)
1. Supabase Dashboard → your project → **Settings → API Keys**.
2. Copy the project URL, a **publishable** key, and create/copy a **secret** key.
3. In the project folder: `Copy-Item .env.example .env.local` (macOS/Linux: `cp .env.example .env.local`).
4. Open `.env.local` and replace the three placeholders. No quotes, no spaces around `=`.
5. Run `npm run check:env` — every line should be PASS (WARN lines explain optional improvements).
6. Restart `npm run dev` (env files are read at start-up).

Never paste real keys into chat, issues, screenshots or commit messages. `.env.local` is git-ignored (`.env*` in `.gitignore`); `check:env` also confirms it is not tracked and was never committed.

### 5.3 Vercel (step by step)
1. Project → **Settings → Environment Variables**.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as type **Config**, environments Production + Preview.
3. Add `SUPABASE_SERVICE_ROLE_KEY` as type **Secret** (write-only after saving), environment **Production** only — preview deployments then can't create guest orders.
4. Redeploy. `NEXT_PUBLIC_*` values are baked in at build time, so any change to them needs a new deployment.
5. Open `/api/products` on the deployed site — it should return JSON with products.
Never create a variable whose name starts with `NEXT_PUBLIC_` and contains `SERVICE` or `SECRET`; the build will fail on purpose.

### 5.4 Database permissions protecting orders
- `orders` / `order_items`: visitors (`anon`) have **no** privileges; signed-in customers have SELECT only, and RLS limits it to `user_id = auth.uid()`.
- Orders are created only through `create_order()`, executable by `authenticated` and `service_role` — not `anon`.
- Verify any time: `supabase/verify.sql`, `supabase/tests/order_processing.test.sql`, and the live checks in `npm run check:env`.

### 5.5 If a key was committed to Git or exposed
Treat it as compromised — deleting the file or rewriting history does not "un-leak" it (forks, caches, clones).

**Secret key (`sb_secret_…`)**
1. Find and fix how it leaked first (e.g. a committed `.env.local`: `git rm --cached .env.local`, confirm `.gitignore`).
2. Supabase → **Settings → API Keys** → create a **new** secret key.
3. Put the new key in `.env.local` and in Vercel (Secret), redeploy, and confirm with `npm run check:env` and a test order.
4. **Delete** the old secret key in Supabase (this can't be undone — only after step 3 works).
5. Review recent orders/data for anything you didn't do.

**Legacy `service_role` key**
1. Create a new secret key (`sb_secret_…`) and switch to it as above.
2. Then **deactivate the legacy keys** in **Settings → API Keys** (switch the public variable to a publishable key first, since that disables the legacy `anon` key too).

**Publishable / anon key** — designed to be public; rotate it only if you want to, by creating a new publishable key, deploying, then removing the old one.

**Cleaning Git history** (optional, after rotating): use `git filter-repo` or BFG to remove the file, force-push, and ask collaborators to re-clone. On GitHub, also check **Security → Secret scanning** alerts.
