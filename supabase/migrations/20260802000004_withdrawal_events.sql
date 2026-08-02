-- ============================================================
-- 提領狀態轉換的事件表 + 狀態機改寫（規劃書階段 2.3）
-- ============================================================
--
-- **為什麼是事件表而不是在主表加欄位**：舊版 admin_update_withdrawal_status
-- 用 `note = coalesce(p_note, note)` 覆寫單一欄位。新增「代為完成」轉換之後,
-- 第二次填的理由會蓋掉第一次——金流稽核不能丟歷史。加 processed_by /
-- completed_by 兩個欄位只是把同一個覆寫問題搬到別的地方。
--
-- **bank_ref 是唯一能跟銀行對帳的錨點**：爭議發生時（會員說沒收到錢）,
-- 「某個 admin 點過兩次按鈕」不構成證據,能拿去問銀行的交易序號才是。
--
-- 基準函數：20260718000101 的 §6c（confirm_withdrawal_collection）與
-- §6d（admin_update_withdrawal_status）。**回滾時從該檔取回原版。**
-- ============================================================

create table public.withdrawal_events (
  id             uuid primary key default gen_random_uuid(),
  withdrawal_id  uuid not null references public.withdrawals(id) on delete cascade,
  -- null = 會員自己的動作（查收確認）。不另開欄位表達同一件事。
  admin_id       uuid references public.profiles(id) on delete set null,
  from_status    text not null,
  to_status      text not null,
  note           text,
  bank_ref       text,   -- 匯款交易序號（選填：部分網銀批次轉帳不逐筆給號）
  transferred_on date,   -- 匯款日期
  created_at     timestamptz not null default now()
);

create index idx_withdrawal_events_withdrawal
  on public.withdrawal_events (withdrawal_id, created_at);

-- 本專案零例外的建表慣例（比照 system_alerts / member_verify_logs /
-- announcements）：20260717000001 明訂不做 blanket grant、預設權限不可依賴,
-- 每張新表要自己顯式收緊。不開 policy = 只有 service_role 可存取。
--
-- 這張表存 admin_id / bank_ref / note,漏了這兩行等於讓任何登入使用者經
-- PostgREST 讀到全站提領稽核紀錄。
alter table public.withdrawal_events enable row level security;
revoke all on public.withdrawal_events from anon, authenticated;

-- 主表的 note 自本 migration 起停止寫入,保留欄位僅為既有資料。
-- （比照 subscriptions.is_canceled 的 vestigial 註記慣例。）
comment on column public.withdrawals.note is
  'vestigial（20260802000004 起）：狀態轉換的備註改記於 withdrawal_events.note。'
  '單一欄位會被後續轉換覆寫,不足以承載金流稽核歷史。舊資料保留不清除。';

-- ------------------------------------------------------------
-- admin_update_withdrawal_status：擴充「代為標記完成」+ 事件表
--
-- 合法轉換（其餘一律 invalid_transition）：
--   pending              → awaiting_collection   note 選填
--   pending              → rejected              note 必填 + 補償退款
--   awaiting_collection  → completed             note 必填,不寫帳本
--
-- note 必填的判準：**會員沒有同意、但錢的狀態被改變**的動作。
-- awaiting_collection → rejected 仍不開放（錢已匯出,走人工 adjustment）。
--
-- ⚠️ 先 drop 舊簽章：新增兩個參數之後,`create or replace` 建立的是**多載**
-- 而不是取代——舊的 4 參數版本會留著,而它仍然寫 withdrawals.note、也不受理
-- completed。PostgREST 依參數名解析,呼叫端少帶兩個參數就會打到舊版,新規則
-- 靜默失效。
-- ------------------------------------------------------------
drop function if exists public.admin_update_withdrawal_status(uuid, uuid, text, text);

create or replace function public.admin_update_withdrawal_status(
  p_admin_id       uuid,
  p_withdrawal_id  uuid,
  p_status         text,
  p_note           text default null,
  p_bank_ref       text default null,
  p_transferred_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin     boolean;
  v_user_id      uuid;
  v_status       text;
  v_amount       int;
  v_fee          int;
  v_note         text;
  v_processed_at timestamptz;
begin
  select is_admin into v_is_admin from public.profiles where id = p_admin_id;
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '僅限管理員');
  end if;

  if p_status not in ('awaiting_collection', 'rejected', 'completed') then
    return jsonb_build_object('success', false, 'error_code', 'invalid_status',
      'message', '狀態只能轉為 awaiting_collection、rejected 或 completed');
  end if;

  select user_id, status, amount, fee into v_user_id, v_status, v_amount, v_fee
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆提領記錄');
  end if;

  -- 重入冪等：不重複寫事件（事件表是稽核歷史,重複的轉換不是歷史）
  if v_status = p_status then
    return jsonb_build_object('success', true, 'idempotent', true, 'status', v_status);
  end if;

  if not (
    (v_status = 'pending' and p_status in ('awaiting_collection', 'rejected'))
    or (v_status = 'awaiting_collection' and p_status = 'completed')
  ) then
    return jsonb_build_object('success', false, 'error_code', 'invalid_transition',
      'message', format('狀態 %s 不能轉為 %s', v_status, p_status));
  end if;

  -- 退件與代為完成都是「會員沒同意、錢的狀態卻變了」,必須說得出原因。
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if p_status in ('rejected', 'completed') and v_note is null then
    return jsonb_build_object('success', false, 'error_code', 'note_required',
      'message', '此操作必須填寫原因,稽核與客訴都會用到');
  end if;

  update public.withdrawals
  set status       = p_status,
      processed_at = case when p_status = 'completed' then processed_at else now() end,
      completed_at = case when p_status = 'completed' then now() else completed_at end
      -- note 不再寫入：見上方 column comment
  where id = p_withdrawal_id
  returning processed_at into v_processed_at;

  insert into public.withdrawal_events (
    withdrawal_id, admin_id, from_status, to_status, note, bank_ref, transferred_on
  )
  values (p_withdrawal_id, p_admin_id, v_status, p_status, v_note, p_bank_ref, p_transferred_on);

  if p_status = 'rejected' then
    -- 補償退款（structural 防雙退：同一筆提領只會有一筆 adjustment）
    if not exists (
      select 1 from public.reward_transactions
      where withdrawal_id = p_withdrawal_id and type = 'adjustment'
    ) then
      insert into public.reward_transactions (user_id, type, amount, withdrawal_id, description)
      values (v_user_id, 'adjustment', v_amount + v_fee, p_withdrawal_id, '提領遭退件，點數退回');
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', p_status,
    'processed_at', v_processed_at
  );
end;
$$;

-- ------------------------------------------------------------
-- confirm_withdrawal_collection：補寫事件（admin_id 為 null）。
-- 其餘語意不變——不寫帳本,扣款在申請當下已完成。
-- ------------------------------------------------------------
create or replace function public.confirm_withdrawal_collection(
  p_user_id       uuid,
  p_withdrawal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner        uuid;
  v_status       text;
  v_completed_at timestamptz;
begin
  select user_id, status into v_owner, v_status
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_owner is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆提領記錄');
  end if;
  if v_owner <> p_user_id then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '這筆提領不屬於你');
  end if;
  if v_status = 'completed' then
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'completed');
  end if;
  if v_status <> 'awaiting_collection' then
    return jsonb_build_object('success', false, 'error_code', 'invalid_status',
      'message', '這筆提領尚未匯款，無法確認查收');
  end if;

  update public.withdrawals
  set status = 'completed', completed_at = now()
  where id = p_withdrawal_id
  returning completed_at into v_completed_at;

  insert into public.withdrawal_events (withdrawal_id, admin_id, from_status, to_status)
  values (p_withdrawal_id, null, 'awaiting_collection', 'completed');

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'completed',
    'completed_at', v_completed_at
  );
end;
$$;

-- Postgres 對函數 EXECUTE 預設授予 PUBLIC，而 PostgREST 的 rpc 端點不經過
-- Edge Function 的守門（規劃書 §2.5、審查 P0-2）。
revoke execute on function
  public.admin_update_withdrawal_status(uuid, uuid, text, text, text, date)
  from anon, authenticated, public;
revoke execute on function public.confirm_withdrawal_collection(uuid, uuid)
  from anon, authenticated, public;
