-- ============================================================
-- 批次標記已匯款（規劃書階段 2.4 / 驗收情境 W2）
-- ============================================================
--
-- admin 的實際工作型態是「網銀做一批轉帳，回來標記一批」。CSV 匯出的存在
-- 本身就證明批次是真的——匯得出去、標不回來，工作流是斷的。
--
-- **逐筆各自的 bank_ref**：單一共用參數達不到 W2「交易序號可逐筆填或留空」。
-- 批次是 admin 的主要路徑，這個缺口會讓「bank_ref 是唯一對帳錨點」的核心
-- 設計在最常用的地方失效。
--
-- **每筆包一層 begin...exception**：Postgres 函數預設是**單一交易**，任何
-- 未攔截的例外（壞掉的 uuid、deadlock、約束違反）會讓整批 rollback，連迴圈
-- 中已判定成功的一起消失——「部分失敗不整批回滾」這個對外承諾在硬錯誤下
-- 就會是假的。既有慣例見 20260720000001 的 apply_referral_side_effects。
-- ============================================================

create or replace function public.admin_batch_mark_paid(
  p_admin_id       uuid,
  p_items          jsonb,
  p_transferred_on date default null,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_item     jsonb;
  v_result   jsonb;
  v_ok       jsonb := '[]'::jsonb;
  v_failed   jsonb := '[]'::jsonb;
begin
  select is_admin into v_is_admin from public.profiles where id = p_admin_id;
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '僅限管理員');
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    -- 這個 begin 區塊就是 savepoint 邊界：區塊內擲例外只回滾這一筆。
    begin
      v_result := public.admin_update_withdrawal_status(
        p_admin_id,
        (v_item ->> 'id')::uuid,   -- 壞掉的 uuid 會在這裡擲 invalid_input_syntax
        'awaiting_collection',
        p_note,
        v_item ->> 'bank_ref',
        p_transferred_on
      );

      if coalesce((v_result ->> 'success')::boolean, false) then
        v_ok := v_ok || jsonb_build_array(v_item ->> 'id');
      else
        v_failed := v_failed || jsonb_build_array(jsonb_build_object(
          'id', v_item ->> 'id',
          'error_code', v_result ->> 'error_code'
        ));
      end if;
    exception
      when others then
        v_failed := v_failed || jsonb_build_array(jsonb_build_object(
          'id', v_item ->> 'id',
          'error_code', 'exception',
          'message', SQLERRM
        ));
    end;
  end loop;

  -- 回傳明細而非只給筆數：批次裡有一筆狀態被別人改過時，admin 要知道
  -- **哪幾筆**需要重做，不是「有東西失敗了」。
  return jsonb_build_object('success', true, 'succeeded', v_ok, 'failed', v_failed);
end;
$$;

revoke execute on function public.admin_batch_mark_paid(uuid, jsonb, date, text)
  from anon, authenticated, public;
