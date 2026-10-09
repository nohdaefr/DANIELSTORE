-- =====================================================================
-- סופר שכונתי — Sample data
-- Run AFTER supabase/schema.sql.
-- Idempotent: re-running updates existing rows instead of duplicating.
-- Prices are illustrative sample prices for an educational project.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Categories (5)
-- ---------------------------------------------------------------------
insert into public.categories (name, slug, sort_order) values
  ('מוצרי חלב וביצים', 'dairy-eggs',        1),
  ('לחם ומאפים',       'bakery',            2),
  ('פירות וירקות',     'fruits-vegetables', 3),
  ('מזווה ושימורים',   'pantry',            4),
  ('משקאות',           'drinks',            5)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Products (25) — category resolved by slug, never by hard-coded id
-- ---------------------------------------------------------------------
insert into public.products
  (category_id, sku, name, description, unit, price, stock_quantity, is_available)
select c.id, v.sku, v.name, v.description, v.unit, v.price, v.stock, v.available
from (values
  -- מוצרי חלב וביצים
  ('dairy-eggs', 'DAIRY-001', 'חלב 3% שומן בקרטון',  'חלב טרי מפוסטר',             '1 ליטר',      6.90, 120, true),
  ('dairy-eggs', 'DAIRY-002', 'גבינה לבנה 5%',       'גבינה רכה למריחה',           '250 גרם',     5.50,  80, true),
  ('dairy-eggs', 'DAIRY-003', 'קוטג׳ 5%',            'גבינת קוטג׳ קלאסית',         '250 גרם',     6.20,  90, true),
  ('dairy-eggs', 'DAIRY-004', 'גבינה צהובה פרוסה 28%','פרוסות דקות לכריך',         '200 גרם',    14.90,  60, true),
  ('dairy-eggs', 'DAIRY-005', 'ביצים L',             'מגש ביצים טריות',            '12 יחידות',  13.50, 100, true),
  ('dairy-eggs', 'DAIRY-006', 'יוגורט טבעי 3%',      'יוגורט ללא תוספת סוכר',      '200 גרם',     4.20,  70, true),
  -- לחם ומאפים
  ('bakery',     'BAKE-001',  'לחם אחיד פרוס',       'לחם לבן פרוס, מפוקח',        '750 גרם',     8.20,  50, true),
  ('bakery',     'BAKE-002',  'חלה מתוקה',           'חלה קלועה לשבת',             'יחידה',      12.90,  40, true),
  ('bakery',     'BAKE-003',  'פיתות',               'פיתות טריות מהמאפייה',       '10 יחידות',   9.90,  45, true),
  ('bakery',     'BAKE-004',  'לחם מחמצת מלא',       'לחם מקמח מלא, אפייה ארוכה',  '600 גרם',    18.90,   0, false),
  -- פירות וירקות
  ('fruits-vegetables', 'VEG-001', 'עגבניות',        'עגבניות אשכולות',            'ק"ג',         7.90, 200, true),
  ('fruits-vegetables', 'VEG-002', 'מלפפונים',       'מלפפונים ישראליים',          'ק"ג',         5.90, 180, true),
  ('fruits-vegetables', 'VEG-003', 'בצל יבש',        'בצל צהוב',                   'ק"ג',         4.90, 150, true),
  ('fruits-vegetables', 'VEG-004', 'תפוחי אדמה',     'תפוחי אדמה לבישול ואפייה',   'ק"ג',         4.50, 160, true),
  ('fruits-vegetables', 'FRT-001', 'תפוחי עץ פינק ליידי','תפוחים פריכים ומתוקים',  'ק"ג',        11.90, 100, true),
  ('fruits-vegetables', 'FRT-002', 'בננות',          'בננות בשלות',                'ק"ג',         8.90, 120, true),
  -- מזווה ושימורים
  ('pantry',     'PANT-001',  'אורז פרסי',           'אורז ארוך גרגר',             '1 ק"ג',      11.90,  75, true),
  ('pantry',     'PANT-002',  'פתיתים אפויים',       'פתיתים קלאסיים',             '500 גרם',     5.90,  85, true),
  ('pantry',     'PANT-003',  'טחינה גולמית',        'טחינה 100% שומשום',          '500 גרם',    16.90,  55, true),
  ('pantry',     'PANT-004',  'חומוס מוכן',          'ממרח חומוס עם טחינה',       '400 גרם',     7.90,  65, true),
  ('pantry',     'PANT-005',  'שמן זית כתית מעולה',  'שמן זית ישראלי',             '750 מ"ל',    39.90,  30, true),
  ('pantry',     'PANT-006',  'במבה',                'חטיף בוטנים',                '80 גרם',      4.90, 140, true),
  -- משקאות
  ('drinks',     'DRNK-001',  'מים מינרליים',        'מים מינרליים טבעיים',        '1.5 ליטר',    3.50, 300, true),
  ('drinks',     'DRNK-002',  'מיץ תפוזים טבעי',     'סחוט, ללא תוספת סוכר',       '1 ליטר',     14.90,  40, true),
  ('drinks',     'DRNK-003',  'סודה',                'מים מוגזים',                 '1.5 ליטר',    4.20, 110, true)
) as v(category_slug, sku, name, description, unit, price, stock, available)
join public.categories c on c.slug = v.category_slug
on conflict (sku) do update
  set category_id    = excluded.category_id,
      name           = excluded.name,
      description    = excluded.description,
      unit           = excluded.unit,
      price          = excluded.price,
      stock_quantity = excluded.stock_quantity,
      is_available   = excluded.is_available;

-- ---------------------------------------------------------------------
-- Sanity check: abort (roll back) if anything is off
-- ---------------------------------------------------------------------
do $$
declare
  v_categories int;
  v_products   int;
  v_orphans    int;
begin
  select count(*) into v_categories from public.categories;
  select count(*) into v_products   from public.products;
  select count(*) into v_orphans
  from public.categories c
  where not exists (select 1 from public.products p where p.category_id = c.id);

  if v_categories < 5 or v_products < 20 or v_orphans > 0 then
    raise exception 'Seed check failed: % categories, % products, % empty categories',
      v_categories, v_products, v_orphans;
  end if;

  raise notice 'Seed OK: % categories, % products', v_categories, v_products;
end;
$$;

commit;
