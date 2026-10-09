-- =====================================================================
-- Migration 002 — Order processing backend
--
-- Run AFTER supabase/schema.sql (and before or after seed.sql — order
-- doesn't matter). Safe to re-run.
--
-- What it adds:
--   * Customer / delivery details on orders (no payment data, ever)
--   * Guest orders (user_id NULL) created only by the server
--   * Idempotency key per order, so a retried request can't create a
--     second order
--   * public.create_order(customer, items, idempotency_key): validates,
--     prices, checks stock and writes the order in ONE transaction
--   * Removes the older public.place_order(jsonb)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. orders: new columns
-- ---------------------------------------------------------------------
alter table public.orders alter column user_id drop not null; -- NULL = guest order

alter table public.orders
  add column if not exists customer_name    text,
  add column if not exists customer_phone   text,   -- normalized, digits only: 0501234567
  add column if not exists customer_email   text,
  add column if not exists delivery_city    text,
  add column if not exists delivery_address text,
  add column if not exists notes            text,
  add column if not exists idempotency_key  uuid,
  add column if not exists request_hash     text;   -- fingerprint of the original request

-- Same rules as the API validation (defense in depth)
alter table public.orders
  drop constraint if exists orders_customer_name_valid,
  add  constraint orders_customer_name_valid
       check (customer_name is null or (char_length(customer_name) between 2 and 80 and customer_name !~ '[[:cntrl:]]')),
  drop constraint if exists orders_customer_phone_valid,
  add  constraint orders_customer_phone_valid
       check (customer_phone is null or customer_phone ~ '^0(5[0-9]{8}|7[0-9]{8}|[2-489][0-9]{7})$'),
  drop constraint if exists orders_customer_email_valid,
  add  constraint orders_customer_email_valid
       check (customer_email is null or (char_length(customer_email) <= 254
              and customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  drop constraint if exists orders_delivery_city_valid,
  add  constraint orders_delivery_city_valid
       check (delivery_city is null or (char_length(delivery_city) between 2 and 60 and delivery_city !~ '[[:cntrl:]]')),
  drop constraint if exists orders_delivery_address_valid,
  add  constraint orders_delivery_address_valid
       check (delivery_address is null or (char_length(delivery_address) between 2 and 120 and delivery_address !~ '[[:cntrl:]]')),
  drop constraint if exists orders_notes_valid,
  add  constraint orders_notes_valid
       check (notes is null or char_length(notes) <= 300),
  drop constraint if exists orders_idempotency_key_unique,
  add  constraint orders_idempotency_key_unique unique (idempotency_key);

-- New orders must carry delivery details. NOT VALID = existing rows from
-- before this migration are not checked, every new/updated row is.
alter table public.orders
  drop constraint if exists orders_customer_required,
  add  constraint orders_customer_required
       check (customer_name is not null and customer_phone is not null
              and delivery_city is not null and delivery_address is not null) not valid;

-- ---------------------------------------------------------------------
-- 2. Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------

-- Raises a business error the API can recognize:
--   SQLSTATE P0001, MESSAGE = machine-readable code, DETAIL = JSON
create or replace function public.raise_order_error(p_code text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail::text;
end;
$$;

-- The order as returned to the caller
create or replace function public.order_summary(p_order_id bigint, p_replayed boolean)
returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id',     o.id,
    'status',       o.status,
    'total_amount', o.total_amount,
    'created_at',   o.created_at,
    'replayed',     p_replayed,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id',   i.product_id,
               'product_name', i.product_name,
               'quantity',     i.quantity,
               'unit_price',   i.unit_price,
               'line_total',   i.line_total) order by i.id)
      from public.order_items i
      where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id
$$;

-- ---------------------------------------------------------------------
-- 3. create_order — the only way to create an order
--
-- p_customer:        {"full_name","phone","city","address","email"?,"notes"?}
-- p_items:           [{"product_id": 1, "quantity": 2}, ...]
--                    Any other keys (e.g. "price") are IGNORED: prices
--                    are read from public.products, never from the caller.
-- p_idempotency_key: UUID chosen by the client per checkout attempt.
--
-- Everything below runs in a single transaction. Any RAISE rolls back
-- every insert/update made so far — no partial orders, no lost stock.
-- ---------------------------------------------------------------------
drop function if exists public.place_order(jsonb);

create or replace function public.create_order(
  p_customer        jsonb,
  p_items           jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer          -- runs as the table owner, so callers need no table write grants
set search_path = ''      -- no search_path tricks: every name is schema-qualified
set lock_timeout = '5s'   -- don't wait forever on a busy product row
as $$
declare
  c_max_lines    constant integer := 50;
  c_max_quantity constant integer := 100;
  c_max_units    constant integer := 500;

  v_user_id  uuid := auth.uid();
  v_role     text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_name     text;
  v_phone    text;
  v_email    text;
  v_city     text;
  v_address  text;
  v_notes    text;
  v_bad_key  text;
  v_ids      bigint[];
  v_qtys     integer[];
  v_hash     text;
  v_existing record;
  v_bad      record;
  v_order_id bigint;
begin
  -- 0. Caller: a signed-in customer, or our server (service_role) for guests
  if v_user_id is null and v_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  if p_idempotency_key is null then
    perform public.raise_order_error('INVALID_REQUEST', jsonb_build_object('field', 'idempotency_key'));
  end if;

  -- 1. Customer details ------------------------------------------------
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'customer'));
  end if;

  select k into v_bad_key
  from jsonb_object_keys(p_customer) as k
  where k not in ('full_name', 'phone', 'email', 'city', 'address', 'notes')
  limit 1;
  if v_bad_key is not null then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', v_bad_key, 'reason', 'unknown_field'));
  end if;

  select e.k into v_bad_key
  from jsonb_each(p_customer) as e(k, v)
  where jsonb_typeof(e.v) <> 'string'
    and not (e.k in ('email', 'notes') and jsonb_typeof(e.v) = 'null')
  limit 1;
  if v_bad_key is not null then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', v_bad_key, 'reason', 'not_a_string'));
  end if;

  v_name    := btrim(p_customer ->> 'full_name');
  v_phone   := regexp_replace(coalesce(p_customer ->> 'phone', ''), '[[:space:]().-]', '', 'g');
  if v_phone like '+972%' then
    v_phone := '0' || substr(v_phone, 5);
  end if;
  v_email   := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_city    := btrim(p_customer ->> 'city');
  v_address := btrim(p_customer ->> 'address');
  v_notes   := nullif(btrim(p_customer ->> 'notes'), '');

  if v_name is null or char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]' then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'full_name'));
  end if;
  if v_phone !~ '^0(5[0-9]{8}|7[0-9]{8}|[2-489][0-9]{7})$' then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'phone'));
  end if;
  if v_email is not null and (char_length(v_email) > 254
       or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'email'));
  end if;
  if v_city is null or char_length(v_city) not between 2 and 60 or v_city ~ '[[:cntrl:]]' then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'city'));
  end if;
  if v_address is null or char_length(v_address) not between 2 and 120 or v_address ~ '[[:cntrl:]]' then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'address'));
  end if;
  if v_notes is not null and (char_length(v_notes) > 300 or v_notes ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]') then
    perform public.raise_order_error('INVALID_CUSTOMER', jsonb_build_object('field', 'notes'));
  end if;

  -- 2. Items -----------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.raise_order_error('INVALID_ITEMS', jsonb_build_object('reason', 'empty'));
  end if;
  if jsonb_array_length(p_items) > c_max_lines then
    perform public.raise_order_error('INVALID_ITEMS', jsonb_build_object('reason', 'too_many_lines', 'max', c_max_lines));
  end if;

  -- product_id and quantity must be whole JSON numbers (not "2", not 1.5)
  if exists (
    select 1 from jsonb_array_elements(p_items) as e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'product_id') is distinct from 'number'
       or jsonb_typeof(e -> 'quantity')   is distinct from 'number'
       or (e ->> 'product_id') !~ '^[0-9]{1,15}$'
       or (e ->> 'quantity')   !~ '^[0-9]{1,6}$'
  ) then
    perform public.raise_order_error('INVALID_ITEMS', jsonb_build_object('reason', 'invalid_item'));
  end if;

  -- Merge repeated lines of the same product; sorted by id (lock order)
  select array_agg(m.product_id order by m.product_id),
         array_agg(m.quantity   order by m.product_id)
    into v_ids, v_qtys
  from (
    select (e ->> 'product_id')::bigint as product_id,
           sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as e
    group by 1
  ) as m;

  if exists (select 1 from unnest(v_qtys) as q where q < 1 or q > c_max_quantity) then
    perform public.raise_order_error('INVALID_ITEMS', jsonb_build_object('reason', 'invalid_quantity', 'max', c_max_quantity));
  end if;
  if (select sum(q) from unnest(v_qtys) as q) > c_max_units then
    perform public.raise_order_error('INVALID_ITEMS', jsonb_build_object('reason', 'too_many_units', 'max', c_max_units));
  end if;

  -- 3. Duplicate requests (idempotency) -------------------------------
  -- Fingerprint of WHO is ordering WHAT. Same key + same fingerprint
  -- = a retry; same key + different fingerprint = a client bug.
  v_hash := md5(jsonb_build_object(
    'user', v_user_id,
    'customer', jsonb_build_object('full_name', v_name, 'phone', v_phone, 'email', v_email,
                                   'city', v_city, 'address', v_address, 'notes', v_notes),
    'items', (select jsonb_agg(jsonb_build_array(t.id, t.qty) order by t.id)
              from unnest(v_ids, v_qtys) as t(id, qty))
  )::text);

  -- Requests with the same key wait for each other here (released at
  -- commit/rollback), so two simultaneous retries can't both insert.
  perform pg_advisory_xact_lock(hashtextextended('create_order:' || p_idempotency_key::text, 0));

  select o.id, o.request_hash into v_existing
  from public.orders as o
  where o.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash is distinct from v_hash then
      perform public.raise_order_error('IDEMPOTENCY_KEY_REUSED');
    end if;
    return public.order_summary(v_existing.id, true); -- replay: no new order, no stock change
  end if;

  -- 4. Lock the products, then check them -----------------------------
  -- FOR UPDATE: concurrent orders for the same product queue up here.
  -- Always locking in id order prevents deadlocks between orders.
  perform 1
  from public.products as p
  where p.id = any (v_ids)
  order by p.id
  for update;

  select r.product_id into v_bad
  from unnest(v_ids) as r(product_id)
  left join public.products as p on p.id = r.product_id
  where p.id is null
  order by r.product_id
  limit 1;
  if found then
    perform public.raise_order_error('PRODUCT_NOT_FOUND', jsonb_build_object('product_id', v_bad.product_id));
  end if;

  select p.id, p.name into v_bad
  from public.products as p
  where p.id = any (v_ids) and not p.is_available
  order by p.id
  limit 1;
  if found then
    perform public.raise_order_error('PRODUCT_UNAVAILABLE',
      jsonb_build_object('product_id', v_bad.id, 'product_name', v_bad.name));
  end if;

  -- Stock is read AFTER the lock, so it reflects every committed order
  select p.id, p.name, p.stock_quantity, r.quantity into v_bad
  from unnest(v_ids, v_qtys) as r(product_id, quantity)
  join public.products as p on p.id = r.product_id
  where p.stock_quantity < r.quantity
  order by p.id
  limit 1;
  if found then
    perform public.raise_order_error('INSUFFICIENT_STOCK', jsonb_build_object(
      'product_id', v_bad.id, 'product_name', v_bad.name,
      'requested', v_bad.quantity, 'available', v_bad.stock_quantity));
  end if;

  -- 5. Write everything ------------------------------------------------
  insert into public.orders (user_id, status, customer_name, customer_phone, customer_email,
                             delivery_city, delivery_address, notes, idempotency_key, request_hash)
  values (v_user_id, 'pending', v_name, v_phone, v_email,
          v_city, v_address, v_notes, p_idempotency_key, v_hash)
  returning id into v_order_id;

  -- unit_price comes from the products table (locked above)
  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
  select v_order_id, p.id, p.name, r.quantity, p.price
  from unnest(v_ids, v_qtys) as r(product_id, quantity)
  join public.products as p on p.id = r.product_id;

  update public.products as p
  set stock_quantity = p.stock_quantity - r.quantity
  from unnest(v_ids, v_qtys) as r(product_id, quantity)
  where p.id = r.product_id;

  -- Total = sum of line totals, calculated by the database
  update public.orders as o
  set total_amount = (select sum(i.line_total) from public.order_items as i where i.order_id = v_order_id)
  where o.id = v_order_id;

  return public.order_summary(v_order_id, false);
end;
$$;

comment on function public.create_order(jsonb, jsonb, uuid) is
  'Creates an order atomically: validates input, reads prices from products, locks and decrements stock, '
  'computes the total. Idempotent per p_idempotency_key. Callable by authenticated users and service_role only.';

-- ---------------------------------------------------------------------
-- 4. Privileges — least privilege
-- ---------------------------------------------------------------------
-- Helpers: nobody but the owner (used from inside create_order)
revoke all on function public.raise_order_error(text, jsonb)   from public, anon, authenticated, service_role;
revoke all on function public.order_summary(bigint, boolean)   from public, anon, authenticated, service_role;

-- create_order: signed-in customers (their own orders, via auth.uid())
-- and service_role (the server, for guest checkout). Never anon.
revoke all on function public.create_order(jsonb, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_order(jsonb, jsonb, uuid) to authenticated, service_role;

-- Customers still have only SELECT on orders/order_items (from schema.sql),
-- limited by RLS to rows where user_id = auth.uid(). Guest orders
-- (user_id NULL) match no customer, so only the server/admin sees them.
