-- ============================================================
-- 後台會員列表／詳情：加上推薦碼與「是否已加入推薦計畫」（第 3 波 工項 A，W2-2／W2-26）
-- ============================================================
--
-- 兩欄的語意（規格書 §7–§10）：
--   * referral_code：該會員目前 active 的推薦碼（`uq_referral_codes_one_active`
--     保證最多一個）。失效（會籍過期）不改 status，所以過期會員仍有碼；
--     從未付費者沒有碼 → null。
--   * referral_program_joined：`profiles.referral_program_joined`——提領前提的
--     「加入推薦計畫」旗標，與「有推薦碼」是兩件事（有碼不代表加入計畫）。
--
-- 回傳型別仍是 jsonb、簽章不變，所以 create or replace 就是取代（不會像
-- 20260802000007 那樣變成多載），不需要 drop。仍重述 revoke，讓權限不依賴既有狀態。
-- ============================================================

create or replace function public.admin_list_members(
  p_search text default null,
  p_status text default null,
  p_sort   text default 'created_desc',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.name,
      p.phone,
      p.is_admin,
      p.suspended_at,
      p.created_at,
      p.id_verification_status,
      p.referral_program_joined,
      (select rc.code from public.referral_codes rc
        where rc.user_id = p.id and rc.status = 'active') as referral_code,
      u.email,
      coalesce(a.status, 'expired') as account_status,
      a.end_date,
      (select count(*) from public.listings l where l.user_id = p.id) as listing_count
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_account_status a on a.user_id = p.id
    where p_search is null or p_search = ''
       or p.name  ilike '%' || p_search || '%'
       or u.email ilike '%' || p_search || '%'
       or p.phone ilike '%' || p_search || '%'
  ),
  filtered as (
    select * from base
    where p_status is null or p_status = '' or p_status = 'all'
       -- 停權是 profiles 上的獨立軸，不是 account_status 的一個值：
       -- 一個停權的人也可能同時是「訂閱中」。分開判斷才不會互相吃掉。
       or (p_status = 'suspended' and suspended_at is not null)
       or (p_status = 'admin'     and is_admin)
       or (p_status = 'active'    and suspended_at is null and account_status = 'active')
       or (p_status = 'expired'   and suspended_at is null and account_status <> 'active')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    -- stats 在 filtered 上算，**不套 limit**——這就是 M2 的全部重點。
    'stats', jsonb_build_object(
      'total',     (select count(*) from filtered),
      'active',    (select count(*) from filtered where suspended_at is null and account_status = 'active'),
      'expired',   (select count(*) from filtered where suspended_at is null and account_status <> 'active'),
      'suspended', (select count(*) from filtered where suspended_at is not null),
      'admins',    (select count(*) from filtered where is_admin)
    ),
    'members', coalesce(
      (select jsonb_agg(to_jsonb(m))
       from (
         select * from filtered
         order by
           case when p_sort = 'created_asc'  then created_at end asc,
           case when p_sort = 'end_date_asc' then end_date  end asc nulls last,
           -- 預設 created_desc：admin 通常在找剛註冊的人（規劃 §6 開放問題 #2）。
           case when p_sort is null or p_sort not in ('created_asc', 'end_date_asc')
                then created_at end desc
         limit least(coalesce(p_limit, 50), 200)
         offset greatest(coalesce(p_offset, 0), 0)
       ) m),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function public.admin_list_members(text, text, text, int, int)
  from anon, authenticated, public;

create or replace function public.admin_member_detail(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                      p.id,
    'name',                    p.name,
    'email',                   u.email,
    'phone',                   p.phone,
    'is_admin',                p.is_admin,
    'suspended_at',            p.suspended_at,
    'created_at',              p.created_at,
    'account_status',          coalesce(a.status, 'expired'),
    'end_date',                a.end_date,
    'id_verification_status',  coalesce(p.id_verification_status, 'none'),
    'id_reject_reason',        p.id_reject_reason,
    'referral_code',           (
      select rc.code from public.referral_codes rc
      where rc.user_id = p.id and rc.status = 'active'
    ),
    'referral_program_joined', p.referral_program_joined,
    -- 原值；遮罩由 edge function 決定，見檔頭。
    'national_id',             p.national_id,
    'bank_code',               p.bank_code,
    'bank_account',            p.bank_account,
    'referrer_name',           r.name,
    'direct_child_count',      (
      select count(*) from public.profiles c where c.referred_by_user_id = p.id
    ),
    'listing_count',           (
      select count(*) from public.listings l where l.user_id = p.id
    ),
    'points',                  public.get_reward_summary(p.id),
    -- 最多 10 筆：客服要的是「最近怎麼了」，不是完整帳本。要看全部回提領
    -- 作業台用會員姓名搜尋。
    'recent_withdrawals', coalesce((
      select jsonb_agg(w_row order by w_row->>'requested_at' desc)
      from (
        select jsonb_build_object(
          'id',            w.id,
          'amount',        w.amount,
          'fee',           w.fee,
          'status',        w.status,
          'requested_at',  w.requested_at,
          'processed_at',  w.processed_at,
          'completed_at',  w.completed_at,
          'note',          (
            select e.note
            from public.withdrawal_events e
            where e.withdrawal_id = w.id
            order by e.created_at desc
            limit 1
          )
        ) as w_row
        from public.withdrawals w
        where w.user_id = p.id
        order by w.requested_at desc
        limit 10
      ) recent
    ), '[]'::jsonb)
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_account_status a on a.user_id = p.id
  left join public.profiles r on r.id = p.referred_by_user_id
  where p.id = p_user_id;
$$;

revoke execute on function public.admin_member_detail(uuid) from anon, authenticated, public;
