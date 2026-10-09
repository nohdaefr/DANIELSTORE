-- =====================================================================
-- סופר שכונתי — Database schema (PostgreSQL / Supabase)
--
-- Run this file FIRST, then supabase/seed.sql.
-- Safe to re-run: objects use IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helper: keep updated_at current on every UPDATE
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. categories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text        not null,
  slug        text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),

  constraint categories_name_unique      unique (name),
  constraint categories_slug_unique      unique (slug),
  constraint categories_name_not_blank   check (length(btrim(name)) > 0),
  constraint categories_slug_format      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_sort_order_valid check (sort_order >= 0)
);

-- ---------------------------------------------------------------------
-- 3. products
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id              bigint generated always as identity primary key,
  category_id     bigint        not null
                  references public.categories (id) on delete restrict,
  sku             text          not null,
  name            text          not null,
  description     text,
  unit            text          not null,           -- e.g. '1 ליטר', 'ק"ג'
  price           numeric(10,2) not null,           -- shekels, exact decimal
  stock_quantity  integer       not null default 0, -- units in inventory
  is_available    boolean       not null default true,
  image_url       text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  constraint products_sku_unique     unique (sku),
  constraint products_sku_format     check (sku ~ '^[A-Z0-9-]{3,32}$'),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_unit_not_blank check (length(btrim(unit)) > 0),
  constraint products_price_valid    check (price > 0 and price < 100000),
  constraint products_stock_valid    check (stock_quantity >= 0)
);

create index if not exists products_category_id_idx
  on public.products (category_id);

-- Partial index for what the storefront actually lists
create index if not exists products_available_idx
  on public.products (category_id, name)
  where is_available;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. orders — one row per checkout, owned by a Supabase Auth user
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id            bigint generated always as identity primary key,
  user_id       uuid          not null
                references auth.users (id) on delete cascade,
  status        text          not null default 'pending',
  total_amount  numeric(12,2) not null default 0,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),

  constraint orders_status_valid check (
    status in ('pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  constraint orders_total_valid check (total_amount >= 0)
);

-- "My orders, newest first" — also serves the RLS check on user_id
create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);

create index if not exists orders_status_idx
  on public.orders (status);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. order_items — price and name frozen at the time of purchase
-- ---------------------------------------------------------------------
create table if not exists public.order_items (
  id            bigint generated always as identity primary key,
  order_id      bigint        not null
                references public.orders (id) on delete cascade,
  product_id    bigint        not null
                references public.products (id) on delete restrict,
  product_name  text          not null,   -- snapshot, survives renames
  quantity      integer       not null,
  unit_price    numeric(10,2) not null,   -- snapshot of products.price
  line_total    numeric(12,2) generated always as (quantity * unit_price) stored,

  constraint order_items_quantity_valid   check (quantity > 0 and quantity <= 100),
  constraint order_items_unit_price_valid check (unit_price > 0),
  constraint order_items_product_once     unique (order_id, product_id)
);

-- order_id lookups use the unique (order_id, product_id) index.
-- product_id needs its own index (FK checks, "who bought X" reports).
create index if not exists order_items_product_id_idx
  on public.order_items (product_id);

-- =====================================================================
-- 6. place_order(items) — the ONLY way a customer can create an order.
--    * user comes from the JWT (auth.uid()), never from the client
--    * prices come from the products table, never from the client
--    * stock is locked, checked and decremented in one transaction
--    Input: '[{"product_id": 1, "quantity": 2}, ...]'::jsonb
--    Returns: the new order id
-- =====================================================================
create or replace function public.place_order(p_items jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_ids      bigint[];
  v_qtys     integer[];
  v_order_id bigint;
  v_bad      text;
begin
  if v_user_id is null then
    raise exception 'יש להתחבר כדי לבצע הזמנה' using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'ההזמנה ריקה' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'יותר מדי שורות בהזמנה אחת' using errcode = '22023';
  end if;

  -- Validate every element's shape before casting (positive integers only)
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'product_id') is distinct from 'number'
       or jsonb_typeof(e -> 'quantity')   is distinct from 'number'
       or (e ->> 'product_id') !~ '^[0-9]{1,15}$'
       or (e ->> 'quantity')   !~ '^[0-9]{1,6}$'
  ) then
    raise exception 'מבנה הזמנה לא תקין' using errcode = '22023';
  end if;

  -- Merge duplicate lines of the same product, sorted by id
  select array_agg(product_id order by product_id),
         array_agg(quantity   order by product_id)
    into v_ids, v_qtys
  from (
    select (e ->> 'product_id')::bigint  as product_id,
           sum((e ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) e
    group by 1
  ) merged;

  if exists (select 1 from unnest(v_qtys) q where q <= 0 or q > 100) then
    raise exception 'כמות לא תקינה (1–100 לכל מוצר)' using errcode = '22023';
  end if;

  -- Lock the requested product rows in a fixed order (avoids deadlocks)
  perform 1
  from public.products p
  where p.id = any (v_ids)
  order by p.id
  for update;

  -- Missing or unavailable product
  select r.product_id::text into v_bad
  from unnest(v_ids) as r(product_id)
  left join public.products p on p.id = r.product_id
  where p.id is null or not p.is_available
  limit 1;
  if found then
    raise exception 'מוצר % אינו זמין', v_bad using errcode = 'P0001';
  end if;

  -- Not enough stock
  select p.name into v_bad
  from unnest(v_ids, v_qtys) as r(product_id, quantity)
  join public.products p on p.id = r.product_id
  where p.stock_quantity < r.quantity
  limit 1;
  if found then
    raise exception 'אין מספיק מלאי עבור "%"', v_bad using errcode = 'P0001';
  end if;

  insert into public.orders (user_id, status)
  values (v_user_id, 'pending')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
  select v_order_id, p.id, p.name, r.quantity, p.price
  from unnest(v_ids, v_qtys) as r(product_id, quantity)
  join public.products p on p.id = r.product_id;

  update public.products p
  set stock_quantity = p.stock_quantity - r.quantity
  from unnest(v_ids, v_qtys) as r(product_id, quantity)
  where p.id = r.product_id;

  update public.orders o
  set total_amount = (select sum(i.line_total)
                      from public.order_items i
                      where i.order_id = v_order_id)
  where o.id = v_order_id;

  return v_order_id;
end;
$$;

-- =====================================================================
-- 7. Privileges — least privilege.
--    Supabase grants broad default privileges on the public schema to
--    anon/authenticated, so revoke everything, then grant back only what
--    each role needs. service_role (server-side only, never shipped to
--    the browser) bypasses RLS and is used for admin work: editing
--    products, stock and order status.
-- =====================================================================
revoke all on table public.categories, public.products,
                    public.orders, public.order_items
  from public, anon, authenticated;

revoke all on function public.set_updated_at()   from public, anon, authenticated;
revoke all on function public.place_order(jsonb) from public, anon, authenticated;

-- Catalog: read-only for everyone (RLS hides unavailable products)
grant select on table public.categories, public.products to anon, authenticated;

-- Orders: signed-in customers may only READ, and RLS limits it to their own.
-- No INSERT/UPDATE/DELETE grants: orders are created only via place_order().
grant select on table public.orders, public.order_items to authenticated;
grant execute on function public.place_order(jsonb) to authenticated;

-- =====================================================================
-- 8. Row Level Security
-- =====================================================================
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "categories are public" on public.categories;
create policy "categories are public"
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists "available products are public" on public.products;
create policy "available products are public"
  on public.products for select
  to anon, authenticated
  using (is_available);

drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders"
  on public.orders for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "customers read own order items" on public.order_items;
create policy "customers read own order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );
