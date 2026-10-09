-- =====================================================================
-- Tests for public.create_order (migration 002)
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor and click
-- Run. The result is a table with one row per check (PASS / FAIL / SKIP).
--
-- SAFE: it creates its own test category, products and users, and rolls
-- EVERYTHING back at the end — your real data and stock are untouched.
-- =====================================================================

-- Calls create_order as the CURRENT role and captures any error.
create or replace function pg_temp.try_order(p_customer jsonb, p_items jsonb, p_key uuid)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
  v_detail text;
begin
  v_result := public.create_order(p_customer, p_items, p_key);
  return jsonb_build_object('ok', true, 'result', v_result);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return jsonb_build_object(
    'ok', false,
    'code', sqlerrm,
    'sqlstate', sqlstate,
    'detail', case when sqlstate = 'P0001' and v_detail like '{%' then v_detail::jsonb else to_jsonb(v_detail) end);
end;
$$;

-- Switches the database role + JWT claims, like a real API request would.
create or replace function pg_temp.act_as(p_role text, p_user uuid default null)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true); -- back to the session user first
  perform set_config('request.jwt.claims',
    case when p_role = 'postgres' then ''
         else jsonb_build_object('role', p_role, 'sub', p_user)::text end, true);
  if p_role <> 'postgres' then
    perform set_config('role', p_role, true);
  end if;
end;
$$;

create or replace function pg_temp.run_order_tests()
returns table (status text, test text, detail text)
language plpgsql
as $$
declare
  v_out     jsonb := '[]'::jsonb;
  v_cat     bigint;
  v_a       bigint;  -- 10.00, stock 5
  v_b       bigint;  -- 2.50,  stock 100
  v_c       bigint;  -- unavailable
  v_user1   uuid := '00000000-0000-4000-8000-0000000000a1';
  v_user2   uuid := '00000000-0000-4000-8000-0000000000a2';
  v_users   boolean := true;
  v_cust    jsonb := jsonb_build_object(
                'full_name', 'דנה כהן', 'phone', '050-123-4567', 'email', 'Dana@Example.com',
                'city', 'תל אביב', 'address', 'הרצל 10, דירה 3');
  r         jsonb;
  r2        jsonb;
  v_n       bigint;
  v_n2      bigint;
  v_key     uuid;
begin
  begin -- everything in this block is rolled back at the end

    -- ---------------------------------------------------------------- fixtures
    perform pg_temp.act_as('postgres');
    insert into public.categories (name, slug, sort_order) values ('בדיקות הזמנה', 'zz-order-tests', 999)
      returning id into v_cat;
    insert into public.products (category_id, sku, name, unit, price, stock_quantity, is_available)
      values (v_cat, 'ZZTEST-A', 'מוצר בדיקה א', 'יחידה', 10.00, 5, true) returning id into v_a;
    insert into public.products (category_id, sku, name, unit, price, stock_quantity, is_available)
      values (v_cat, 'ZZTEST-B', 'מוצר בדיקה ב', 'יחידה', 2.50, 100, true) returning id into v_b;
    insert into public.products (category_id, sku, name, unit, price, stock_quantity, is_available)
      values (v_cat, 'ZZTEST-C', 'מוצר בדיקה ג', 'יחידה', 3.00, 10, false) returning id into v_c;

    begin
      insert into auth.users (id, email) values (v_user1, 'order-test-1@example.com'), (v_user2, 'order-test-2@example.com');
    exception when others then
      v_users := false;
    end;

    -- ---------------------------------------------------------------- 1. success
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust,
      jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 3),
                        jsonb_build_object('product_id', v_b, 'quantity', 4)),
      gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Success: guest order is created',
      'ok', (r ->> 'ok')::boolean, 'd', r);
    v_out := v_out || jsonb_build_object('t', 'Success: total 3×10.00 + 4×2.50 = 40.00 computed by the DB',
      'ok', (r -> 'result' ->> 'total_amount')::numeric = 40.00, 'd', r -> 'result' -> 'total_amount');
    v_out := v_out || jsonb_build_object('t', 'Success: status is pending, 2 lines, not a replay',
      'ok', r -> 'result' ->> 'status' = 'pending' and jsonb_array_length(r -> 'result' -> 'items') = 2
            and (r -> 'result' ->> 'replayed')::boolean = false, 'd', r -> 'result');

    perform pg_temp.act_as('postgres');
    v_out := v_out || jsonb_build_object('t', 'Success: stock decremented (A 5→2, B 100→96)',
      'ok', (select stock_quantity from public.products where id = v_a) = 2
        and (select stock_quantity from public.products where id = v_b) = 96, 'd', null);
    v_out := v_out || jsonb_build_object('t', 'Success: phone normalized, email lower-cased, guest has no user',
      'ok', exists (select 1 from public.orders where id = (r -> 'result' ->> 'order_id')::bigint
                    and customer_phone = '0501234567' and customer_email = 'dana@example.com' and user_id is null),
      'd', null);

    -- ---------------------------------------------------------------- 2. forged price
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust,
      jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 2,
                                           'price', 0.01, 'unit_price', 0.01, 'line_total', 0)),
      gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Forged price: client price 0.01 is ignored, DB price 2.50 is used',
      'ok', (r ->> 'ok')::boolean and (r -> 'result' -> 'items' -> 0 ->> 'unit_price')::numeric = 2.50,
      'd', r -> 'result' -> 'items');
    v_out := v_out || jsonb_build_object('t', 'Forged price: total is 2×2.50 = 5.00, not 0.02',
      'ok', (r -> 'result' ->> 'total_amount')::numeric = 5.00, 'd', r -> 'result' -> 'total_amount');

    -- ---------------------------------------------------------------- 3. nonexistent product
    perform pg_temp.act_as('postgres');
    select count(*) into v_n from public.orders;
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust,
      jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1),
                        jsonb_build_object('product_id', 999999999, 'quantity', 1)),
      gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Nonexistent product: rejected with PRODUCT_NOT_FOUND',
      'ok', r ->> 'code' = 'PRODUCT_NOT_FOUND' and (r -> 'detail' ->> 'product_id')::bigint = 999999999, 'd', r);
    perform pg_temp.act_as('postgres');
    v_out := v_out || jsonb_build_object('t', 'Nonexistent product: no order created, other product''s stock untouched',
      'ok', (select count(*) from public.orders) = v_n
        and (select stock_quantity from public.products where id = v_b) = 94, 'd', null);

    -- ---------------------------------------------------------------- 4. invalid quantity
    perform pg_temp.act_as('service_role');
    for r2 in select * from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('label', '0',           'items', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 0))),
        jsonb_build_object('label', '-1',          'items', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', -1))),
        jsonb_build_object('label', '101',         'items', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 101))),
        jsonb_build_object('label', '1.5',         'items', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1.5))),
        jsonb_build_object('label', '"2" (text)',  'items', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', '2'))),
        jsonb_build_object('label', 'missing',     'items', jsonb_build_array(jsonb_build_object('product_id', v_b))),
        jsonb_build_object('label', '60+60 merged = 120', 'items', jsonb_build_array(
            jsonb_build_object('product_id', v_b, 'quantity', 60), jsonb_build_object('product_id', v_b, 'quantity', 60))),
        jsonb_build_object('label', 'empty list',  'items', '[]'::jsonb)))
    loop
      r := pg_temp.try_order(v_cust, r2 -> 'items', gen_random_uuid());
      v_out := v_out || jsonb_build_object('t', 'Invalid quantity ' || (r2 ->> 'label') || ': rejected with INVALID_ITEMS',
        'ok', r ->> 'code' = 'INVALID_ITEMS', 'd', r);
    end loop;

    r := pg_temp.try_order(v_cust,
      (select jsonb_agg(jsonb_build_object('product_id', 900000000 + g, 'quantity', 1)) from generate_series(1, 51) g),
      gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Too many lines (51 > 50): rejected',
      'ok', r ->> 'code' = 'INVALID_ITEMS' and r -> 'detail' ->> 'reason' = 'too_many_lines', 'd', r);
    r := pg_temp.try_order(v_cust,
      (select jsonb_agg(jsonb_build_object('product_id', 900000000 + g, 'quantity', 100)) from generate_series(1, 6) g),
      gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Too many units (600 > 500): rejected',
      'ok', r ->> 'code' = 'INVALID_ITEMS' and r -> 'detail' ->> 'reason' = 'too_many_units', 'd', r);

    -- ---------------------------------------------------------------- 5. insufficient stock (+ atomicity)
    perform pg_temp.act_as('postgres');
    select count(*) into v_n from public.orders;
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust,
      jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1),
                        jsonb_build_object('product_id', v_a, 'quantity', 3)),
      gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Insufficient stock: rejected with requested 3, available 2',
      'ok', r ->> 'code' = 'INSUFFICIENT_STOCK' and (r -> 'detail' ->> 'requested')::int = 3
            and (r -> 'detail' ->> 'available')::int = 2, 'd', r);
    perform pg_temp.act_as('postgres');
    v_out := v_out || jsonb_build_object('t', 'Insufficient stock: nothing saved, no stock changed (all-or-nothing)',
      'ok', (select count(*) from public.orders) = v_n
        and (select stock_quantity from public.products where id = v_a) = 2
        and (select stock_quantity from public.products where id = v_b) = 94, 'd', null);

    -- ---------------------------------------------------------------- 6. unavailable product
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_c, 'quantity', 1)), gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Unavailable product: rejected with PRODUCT_UNAVAILABLE',
      'ok', r ->> 'code' = 'PRODUCT_UNAVAILABLE', 'd', r);

    -- ---------------------------------------------------------------- 7. duplicate requests
    v_key := gen_random_uuid();
    r  := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), v_key);
    r2 := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), v_key);
    v_out := v_out || jsonb_build_object('t', 'Duplicate request: same key returns the SAME order, marked as replay',
      'ok', (r ->> 'ok')::boolean and (r2 ->> 'ok')::boolean
            and r -> 'result' -> 'order_id' = r2 -> 'result' -> 'order_id'
            and (r2 -> 'result' ->> 'replayed')::boolean, 'd', jsonb_build_array(r, r2));
    perform pg_temp.act_as('postgres');
    v_out := v_out || jsonb_build_object('t', 'Duplicate request: stock decremented only once (94→93)',
      'ok', (select stock_quantity from public.products where id = v_b) = 93
        and (select count(*) from public.orders where idempotency_key = v_key) = 1, 'd', null);
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 2)), v_key);
    v_out := v_out || jsonb_build_object('t', 'Same key with a DIFFERENT order: rejected with IDEMPOTENCY_KEY_REUSED',
      'ok', r ->> 'code' = 'IDEMPOTENCY_KEY_REUSED', 'd', r);
    r := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), null);
    v_out := v_out || jsonb_build_object('t', 'Missing idempotency key: rejected',
      'ok', r ->> 'code' = 'INVALID_REQUEST', 'd', r);

    -- ---------------------------------------------------------------- 8. customer details
    r := pg_temp.try_order(v_cust || '{"phone": "12345"}', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Invalid phone: rejected',
      'ok', r ->> 'code' = 'INVALID_CUSTOMER' and r -> 'detail' ->> 'field' = 'phone', 'd', r);
    r := pg_temp.try_order(v_cust || '{"card_number": "4111111111111111"}', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Payment data (card_number) is refused, never stored',
      'ok', r ->> 'code' = 'INVALID_CUSTOMER' and r -> 'detail' ->> 'field' = 'card_number', 'd', r);
    r := pg_temp.try_order(v_cust - 'city', jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'Missing city: rejected',
      'ok', r ->> 'code' = 'INVALID_CUSTOMER' and r -> 'detail' ->> 'field' = 'city', 'd', r);

    -- ---------------------------------------------------------------- 9. atomicity on a late failure
    -- A trigger makes the SECOND write (order_items) fail after the order row
    -- was already inserted. The whole order must disappear.
    perform pg_temp.act_as('postgres');
    create function pg_temp.fail_on_item() returns trigger language plpgsql as
      'begin raise exception ''simulated crash while saving items''; end';
    create trigger zz_test_fail before insert on public.order_items
      for each row execute function pg_temp.fail_on_item();
    v_key := gen_random_uuid();
    perform pg_temp.act_as('service_role');
    r := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_a, 'quantity', 1)), v_key);
    perform pg_temp.act_as('postgres');
    drop trigger zz_test_fail on public.order_items;
    v_out := v_out || jsonb_build_object('t', 'Atomic: crash while saving items leaves NO order row and NO stock change',
      'ok', (r ->> 'ok')::boolean = false
        and not exists (select 1 from public.orders where idempotency_key = v_key)
        and (select stock_quantity from public.products where id = v_a) = 2, 'd', r);

    -- ---------------------------------------------------------------- 10. permissions
    perform pg_temp.act_as('anon');
    r := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), gen_random_uuid());
    v_out := v_out || jsonb_build_object('t', 'anon (browser without login) cannot call create_order',
      'ok', r ->> 'sqlstate' = '42501', 'd', r);

    begin
      perform 1 from public.orders limit 1;
      v_out := v_out || jsonb_build_object('t', 'anon cannot read orders', 'ok', false, 'd', null);
    exception when insufficient_privilege then
      v_out := v_out || jsonb_build_object('t', 'anon cannot read orders', 'ok', true, 'd', null);
    end;

    if v_users then
      perform pg_temp.act_as('authenticated', v_user1);
      r := pg_temp.try_order(v_cust, jsonb_build_array(jsonb_build_object('product_id', v_b, 'quantity', 1)), gen_random_uuid());
      v_out := v_out || jsonb_build_object('t', 'Signed-in customer can order; order is linked to them',
        'ok', (r ->> 'ok')::boolean, 'd', r);
      select count(*) into v_n from public.orders;
      v_out := v_out || jsonb_build_object('t', 'RLS: customer sees only their own order (not guest orders)',
        'ok', v_n = 1, 'd', to_jsonb(v_n));
      begin
        insert into public.orders (user_id, customer_name, customer_phone, delivery_city, delivery_address)
          values (v_user1, 'x y', '0501234567', 'עיר', 'רחוב');
        v_out := v_out || jsonb_build_object('t', 'Customer cannot insert orders directly (must use create_order)', 'ok', false, 'd', null);
      exception when insufficient_privilege then
        v_out := v_out || jsonb_build_object('t', 'Customer cannot insert orders directly (must use create_order)', 'ok', true, 'd', null);
      end;
      begin
        update public.products set price = 0.01 where id = v_b;
        v_out := v_out || jsonb_build_object('t', 'Customer cannot change prices', 'ok', false, 'd', null);
      exception when insufficient_privilege then
        v_out := v_out || jsonb_build_object('t', 'Customer cannot change prices', 'ok', true, 'd', null);
      end;

      perform pg_temp.act_as('authenticated', v_user2);
      select count(*) into v_n2 from public.orders;
      select count(*) into v_n from public.order_items;
      v_out := v_out || jsonb_build_object('t', 'RLS: another customer sees 0 orders and 0 items',
        'ok', v_n2 = 0 and v_n = 0, 'd', null);
    else
      v_out := v_out || jsonb_build_object('t', 'Signed-in customer tests (could not create test users)', 'ok', null, 'd', null);
    end if;

    perform pg_temp.act_as('postgres');
    raise exception 'ROLLBACK_TEST_DATA';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TEST_DATA' then
      v_out := v_out || jsonb_build_object('t', 'Test run aborted', 'ok', false, 'd', sqlerrm);
    end if;
  end;

  return query
    select case when (e ->> 'ok') is null then 'SKIP' when (e ->> 'ok')::boolean then 'PASS' else 'FAIL' end,
           e ->> 't',
           case when (e ->> 'ok')::boolean then null else e ->> 'd' end
    from jsonb_array_elements(v_out) with ordinality as x(e, n)
    order by n;
end;
$$;

select * from pg_temp.run_order_tests();
