-- ============================================================
-- 會員詳情（規劃書階段 3.2 / 驗收情境 M1）
-- ============================================================
--
-- §1.1 的頭號客服情境是「我提領怎麼還沒到」。**詳情面板答不出這句話就失去
-- 存在意義**——所以 `recent_withdrawals`（狀態、退件理由、匯款與查收時間）
-- 是這支函數的核心欄位，不是附加資訊。理由讀事件表最新一筆，與
-- `/admin/withdrawals` 同源（主表 note 自 20260802000004 起 vestigial）。
--
-- 點數復用 `get_reward_summary`，不在這裡重算——餘額的定義只該有一個地方。
--
-- 遮罩不在 SQL 做：這支回原值，由 edge function 統一套 maskNationalId /
-- maskBankAccount。理由是遮罩規則是**呈現層決策**（提領作業台需要全碼、
-- 查詢台不需要），把它烤進資料層就沒辦法讓兩個呼叫端有不同的答案。
-- ============================================================

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
