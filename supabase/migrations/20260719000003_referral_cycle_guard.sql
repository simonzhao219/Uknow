-- ============================================================
-- Uknow — 0719 0003 推薦循環防護（L1）
-- ============================================================
--
-- fresh 換線（/payuni/prepare）與重送 /auth/register 都可改寫
-- profiles.referred_by_user_id。若把推薦人設成自己的下線，組織圖成環，
-- 3 代發獎鏈會讓同一人重覆計獎、樹狀圖自我巢狀。此函數在寫入前判斷是否
-- 會造環：p_new_referrer 是本人（自我推薦）或本人的後代（= 本人是其祖先）
-- 皆回 true。遞迴向上走推薦邊並設深度上限，避免既有髒資料已成環時無限迴圈。
-- ============================================================

create or replace function public.referral_would_create_cycle(
  p_user         uuid,
  p_new_referrer uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    -- 從新推薦人往上走（referee → referrer），收集其所有祖先（含自身，depth 0）
    select p_new_referrer as node, 0 as depth
    union all
    select e.referrer_user_id, up.depth + 1
    from public.referral_edges e
    join up on e.referee_user_id = up.node
    where up.depth < 50 and e.referrer_user_id is not null
  )
  -- 本人出現在新推薦人的祖先鏈（或就是新推薦人本身）→ 設定後會成環
  select coalesce((select true from up where node = p_user limit 1), false);
$$;

revoke execute on function public.referral_would_create_cycle(uuid, uuid) from anon, authenticated, public;
grant execute on function public.referral_would_create_cycle(uuid, uuid) to service_role;
