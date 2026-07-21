-- ============================================================
-- Uknow — 0721 (4) 領取「免費續約 1 年」credit 需先 active
-- ============================================================
-- 業務決策（2026-07-21）：expired 會員不得用推薦王的「免費續約 1 年」
-- credit「免費復活」。credit 的語意是「續約 1 年」——在既有會籍後面
-- 再接一年，前提是會籍仍有效；到期者必須先正常續訂恢復 active，
-- 才能領取這筆免費續約。
--
-- 修正前的漏洞：claim_referral_king_reward 取「最新一筆訂閱」的 end_date
-- 後直接 +1 年寫回，完全不看該筆現在是否仍有效。若會員已到期
-- （now() > end_date），new_end = 舊 end + 1 年 有機會落在未來，等於
-- 讓到期會員用一筆 credit 免費復活。
--
-- 修正：領取前加一道 active 守衛，判準與 user_account_status view 完全
-- 一致（now() <= end_date 才算 active）。到期則回 subscription_invalid，
-- 不延展、不改動 credit 狀態（維持 unclaimed，續訂後仍可領）。
--
-- 冪等性維持不變：已 claimed 的 credit 仍在 active 檢查「之前」回傳
-- idempotent success——當初在 active 狀態領過就算數，不因日後到期而翻案。
--
-- 除新增守衛外，函數其餘行為（鎖定、擁有權、延展計算、vestigial 的
-- grace_period_end 寫入）與 20260718000001 版本逐字相同。
-- ============================================================

create or replace function public.claim_referral_king_reward(
  p_user_id   uuid,
  p_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_user_id uuid;
  v_reward_status  text;
  v_sub_id         uuid;
  v_old_end        timestamptz;
  v_new_last_day   date;
  v_new_end        timestamptz;
  v_new_grace      timestamptz;
begin
  -- 鎖定這筆 reward，防止雙擊/併發請求同時處理同一筆。
  select user_id, status into v_reward_user_id, v_reward_status
  from public.referral_king_rewards
  where id = p_reward_id
  for update;

  if v_reward_user_id is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆獎勵紀錄');
  end if;

  if v_reward_user_id <> p_user_id then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '這筆獎勵不屬於你');
  end if;

  if v_reward_status = 'claimed' then
    -- 已領取：冪等回傳成功，不重複延展。刻意放在 active 檢查之前——
    -- 當初於 active 狀態領取就算數，不因會員日後到期而翻案。
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'claimed');
  end if;

  -- 鎖定該用戶「目前」訂閱：跟 user_account_status 一樣的判斷邏輯
  -- （依 end_date 排序取最新一筆，不管該筆現在是否仍在效期內）。
  select id, end_date into v_sub_id, v_old_end
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object('success', false, 'error_code', 'no_subscription', 'message', '找不到可延展的訂閱紀錄，請聯繫客服');
  end if;

  -- ★ claim 需先 active：expired 會員不得用免費續約 credit 免費復活。
  -- 判準與 user_account_status view 一致（end_date 為 null 或已過 → expired）。
  -- credit 維持 unclaimed，待會員正常續訂恢復 active 後仍可領取。
  if v_old_end is null or now() > v_old_end then
    return jsonb_build_object(
      'success', false,
      'error_code', 'subscription_invalid',
      'message', '會員資格已失效，請先續訂會員後再領取免費續約'
    );
  end if;

  v_new_last_day := (public.tw_day(v_old_end) + interval '1 year')::date;
  v_new_end      := public.tw_end_of_day(v_new_last_day);
  v_new_grace    := public.tw_end_of_day(v_new_last_day + 60);

  update public.subscriptions
  set end_date = v_new_end, grace_period_end = v_new_grace
  where id = v_sub_id;

  update public.referral_king_rewards
  set status = 'claimed', claimed_at = now(), resulting_subscription_id = v_sub_id
  where id = p_reward_id;

  return jsonb_build_object(
    'success',        true,
    'subscriptionId', v_sub_id,
    'activeUntil',    v_new_end,
    'gracePeriodEnd', v_new_grace
  );

exception when others then
  raise exception 'claim_referral_king_reward 失敗: %', sqlerrm;
end;
$$;

-- 權限維持既有慣例：業務函數只給 service_role，對 anon/authenticated revoke。
revoke execute on function public.claim_referral_king_reward(uuid, uuid) from anon, authenticated, public;
