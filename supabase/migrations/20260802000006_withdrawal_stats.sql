-- ============================================================
-- 提領彙總（規劃書階段 2.5 / 驗收情境 W6）
-- ============================================================
--
-- **待匯款總額是 admin 開網銀前要對的數字**，不是「順便顯示」的統計——
-- 少算一筆就少匯一筆錢。因此它在 SQL 端一次算完（對整個篩選結果），
-- 不是在應用層對「當前頁」加總：後者會隨分頁改變，等於一個會說謊的總額。
--
-- `pending_amount` 用 `amount`（銀行實付）而非 `amount + fee`：手續費是
-- 平台收的，不會匯出去。admin 拿這個數字去對網銀的轉出總額。
-- ============================================================

create or replace function public.admin_withdrawal_stats(
  p_status text default null,
  p_from   date default null,
  p_to     date default null,
  p_search text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select w.status, w.amount
    from public.withdrawals w
    join public.profiles p on p.id = w.user_id
    where (p_status is null or p_status = 'all' or w.status = p_status)
      and (p_from is null or w.requested_at >= p_from::timestamptz)
      -- to 是「當日含」：+1 天再取小於，避免把當天的資料排除掉
      and (p_to is null or w.requested_at < (p_to::timestamptz + interval '1 day'))
      and (p_search is null or p_search = '' or p.name ilike '%' || p_search || '%')
  )
  select jsonb_build_object(
    -- 待匯款總額只看 pending：已匯款的錢不該再出現在「還要匯多少」裡
    'pending_amount', coalesce((select sum(amount) from filtered where status = 'pending'), 0),
    'by_status', jsonb_build_object(
      'pending',             (select count(*) from filtered where status = 'pending'),
      'awaiting_collection', (select count(*) from filtered where status = 'awaiting_collection'),
      'completed',           (select count(*) from filtered where status = 'completed'),
      'rejected',            (select count(*) from filtered where status = 'rejected')
    )
  );
$$;

revoke execute on function public.admin_withdrawal_stats(text, date, date, text)
  from anon, authenticated, public;
