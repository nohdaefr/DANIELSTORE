-- =====================================================================
-- Read-only checks. Run in the Supabase SQL Editor after schema.sql,
-- migrations/002_order_processing.sql and seed.sql.
-- Every row should say true.
-- =====================================================================
select 'tables exist (4)' as "check",
       count(*) = 4 as ok
from pg_tables
where schemaname = 'public'
  and tablename in ('categories', 'products', 'orders', 'order_items')

union all
select 'RLS enabled on all 4 tables',
       count(*) = 4
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('categories', 'products', 'orders', 'order_items')
  and relrowsecurity

union all
select '4 foreign keys defined',
       count(*) = 4
from pg_constraint
where contype = 'f'
  and conrelid in ('public.products'::regclass, 'public.orders'::regclass, 'public.order_items'::regclass)

union all
select 'no FLOAT columns used for money',
       count(*) = 0
from information_schema.columns
where table_schema = 'public'
  and data_type in ('real', 'double precision', 'money')

union all
select 'anon cannot read orders',
       not has_table_privilege('anon', 'public.orders', 'select')

union all
select 'customers cannot write orders directly',
       not has_table_privilege('authenticated', 'public.orders', 'insert')
   and not has_table_privilege('authenticated', 'public.orders', 'update')
   and not has_table_privilege('authenticated', 'public.order_items', 'insert')

union all
select 'migration 002: create_order exists, old place_order removed',
       to_regprocedure('public.create_order(jsonb, jsonb, uuid)') is not null
   and to_regprocedure('public.place_order(jsonb)') is null

union all
select 'create_order: customers + server can call it, anon cannot',
       has_function_privilege('authenticated', 'public.create_order(jsonb, jsonb, uuid)', 'execute')
   and has_function_privilege('service_role', 'public.create_order(jsonb, jsonb, uuid)', 'execute')
   and not has_function_privilege('anon', 'public.create_order(jsonb, jsonb, uuid)', 'execute')

union all
select 'internal helpers are not callable through the API',
       not has_function_privilege('anon', 'public.order_summary(bigint, boolean)', 'execute')
   and not has_function_privilege('authenticated', 'public.order_summary(bigint, boolean)', 'execute')
   and not has_function_privilege('authenticated', 'public.raise_order_error(text, jsonb)', 'execute')

union all
select 'orders have customer details + unique idempotency key',
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'orders'
          and column_name in ('customer_name', 'customer_phone', 'delivery_city', 'delivery_address', 'idempotency_key')) = 5
   and exists (select 1 from pg_constraint where conname = 'orders_idempotency_key_unique')

union all
select 'no payment columns on orders',
       not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'orders'
                     and column_name ~ '(card|cvv|iban|payment|credit)')

union all
select '5 categories seeded',
       (select count(*) from public.categories) = 5

union all
select 'at least 20 products seeded',
       (select count(*) from public.products) >= 20

union all
select 'every category has products',
       not exists (select 1 from public.categories c
                   where not exists (select 1 from public.products p where p.category_id = c.id));
