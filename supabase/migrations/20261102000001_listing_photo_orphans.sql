-- 階段 2 stub（紅燈期）：簽章就位、行為留空。
create or replace function public._listing_photo_is_orphan(p_public_base text, p_name text)
returns boolean
language sql
stable
as $$ select false $$;

create or replace function public.list_orphan_listing_photos(
  p_public_base text,
  p_grace interval,
  p_limit int
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'candidates', '[]'::jsonb,
    'orphan_total', 0,
    'total_objects', 0,
    'referenced_urls', 0,
    'matched_urls', 0
  )
$$;

create or replace function public.filter_unreferenced_listing_photos(
  p_public_base text,
  p_names text[]
)
returns text[]
language sql
stable
as $$ select '{}'::text[] $$;
