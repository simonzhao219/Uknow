-- ============================================================
-- Email 邀請（R2）的空殼帳號清除：purge_stale_referral_invites ＋
-- delete_auth_audit_for_users ＋ pg_cron 每日排程
-- （見 referral-invite-purge.test.ts）。
--
-- 背景：推薦人寄出邀請時，後端以 GoTrue inviteUserByEmail 建一列 auth.users
-- （handle_new_user 再建 profiles 空列），並在 app_metadata.referral_invite 蓋章
-- （code、consent_at、consent_version、issued_at）。這是「代第三人建立的帳號」，
-- 信裡承諾「7 天內未透過連結設定密碼即刪除這次邀請建立的帳號資料」——本檔兌現它。
--
-- 空殼判準（invites 重寄、accept、purge 三處一致）：email 未驗證、從未登入、
-- app_metadata.referral_invite 是物件。只有 service role 能寫 app_metadata，所以
-- 這個章本身就證明是 R2 建的；Dashboard 手動 Invite 與自助註冊的帳號都沒有它。
-- 不看 invited_at：先蓋章後寄信的路徑在寄出前沒有 invited_at。
--
-- 計齡看 issued_at、不看 invited_at：accept 的 generateLink 會把 invited_at
-- 覆寫成現在，以它計齡等於每點一次連結就延壽（業主裁決 C）。重寄會更新
-- issued_at（＝新邀請）。issued_at 壞值（手動改過）跳過，不讓單列中斷整批。
--
-- 付過款的不刪（防禦：付款前必經完善資料與 email 驗證，正常到不了）。
--
-- audit：GoTrue 每筆帳號事件把 email 寫進 auth.audit_log_entries，刪 auth.users
-- 不連帶刪它。invite／modify 類事件的使用者 id 在 payload.traits.user_id，本人
-- 動作的在 payload.actor_id（GoTrue 原始碼核對；hosted 實際形狀待 R2-0 第 6 點）。
-- 抽成 delete_auth_audit_for_users 讓補償路徑（GoTrue deleteUser 之後）共用。
-- GoTrue 另寫一份到 Supabase log 管線，這裡刪不到（信內告知段已寫明）。
--
-- 客服應個資刪除請求：service role 呼叫
--   select public.purge_stale_referral_invites(p_email => '<email>');
-- p_email 模式不套天數，只刪該信箱且符合其餘條件的空殼；回刪除筆數，0 表示
-- 查無空殼（不存在、已驗證或已登入過——那些走一般會員刪除流程）。
--
-- pg_cron 由 20261017000001 建立；這裡不再 create extension——重跑會再觸發
-- Supabase 的 pg_cron 授權 event trigger，撞上既有授權而失敗（2BP01）。
-- ============================================================

-- issued_at → timestamptz；不是字串或 cast 失敗回 null（呼叫端視為「不刪」）。
create or replace function public.referral_invite_issued_at(p_referral_invite jsonb)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_raw text := p_referral_invite ->> 'issued_at';
begin
  if v_raw is null or v_raw !~ '^\d{4}-\d{2}-\d{2}T' then
    return null;
  end if;
  return v_raw::timestamptz;
exception when others then
  return null;
end;
$$;

revoke execute on function public.referral_invite_issued_at(jsonb) from anon, authenticated, public;

-- set-based：一次掃描刪掉所有指向這些使用者的稽核列。
create or replace function public.delete_auth_audit_for_users(p_user_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[] := p_user_ids::text[];
  v_deleted int;
begin
  if coalesce(cardinality(v_ids), 0) = 0 then
    return 0;
  end if;
  delete from auth.audit_log_entries a
  where (a.payload -> 'traits' ->> 'user_id') = any(v_ids)
     or (a.payload ->> 'actor_id') = any(v_ids);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.delete_auth_audit_for_users(uuid[]) from anon, authenticated, public;
grant execute on function public.delete_auth_audit_for_users(uuid[]) to service_role;

create or replace function public.purge_stale_referral_invites(
  p_older_than_days int default 7,
  p_email text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  -- 單一 delete 陳述式內判準與刪除同時成立：判完到刪之間被驗證的帳號不會誤刪。
  with deleted as (
    delete from auth.users u
    where u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and jsonb_typeof(u.raw_app_meta_data -> 'referral_invite') = 'object'
      and not exists (select 1 from public.payment_orders o where o.user_id = u.id)
      and (
        case
          when p_email is not null then lower(u.email) = lower(p_email)
          else public.referral_invite_issued_at(u.raw_app_meta_data -> 'referral_invite')
            < now() - make_interval(days => p_older_than_days)
        end
      )
    returning u.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from deleted;

  perform public.delete_auth_audit_for_users(v_ids);
  return cardinality(v_ids);
end;
$$;

revoke execute on function public.purge_stale_referral_invites(int, text) from anon, authenticated, public;
grant execute on function public.purge_stale_referral_invites(int, text) to service_role;

-- 以 job 名稱 upsert：重跑 migration 不會產生第二個排程。03:23 UTC 避開整點尖峰。
select cron.schedule(
  'purge-stale-referral-invites',
  '23 3 * * *',
  $$select public.purge_stale_referral_invites()$$
);
