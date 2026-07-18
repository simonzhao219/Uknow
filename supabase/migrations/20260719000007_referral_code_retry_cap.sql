-- ============================================================
-- Uknow — 0719 0007 generate_referral_code 重試上限（L3）
-- ============================================================
--
-- 原本 loop ... exit when not exists(...) 無迭代上限：碼空間雖大
-- （26³×10⁶ ≈ 175 億），但跨用戶的「存在檢查 + insert」非原子，理論上
-- 仍可能連續撞碼而空轉。加上重試上限，逾限即拋錯——由呼叫端
-- apply_referral_side_effects 的 warning 隔離接住（記 system_alerts），
-- 再由 repair_orphaned_payments 補發，不會讓整筆付款失敗。
-- ============================================================

create or replace function public.generate_referral_code()
returns text language plpgsql set search_path = public as $$
declare
  letters      text := 'abcdefghijklmnopqrstuvwxyz';
  digits       text := '0123456789';
  v_code       text;
  i            int;
  v_attempts   int := 0;
  v_max        constant int := 20;
begin
  loop
    v_code := '';
    for i in 1..3 loop
      v_code := v_code || substr(letters, floor(random() * 26 + 1)::int, 1);
    end loop;
    for i in 1..6 loop
      v_code := v_code || substr(digits, floor(random() * 10 + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.referral_codes rc where rc.code = v_code);

    v_attempts := v_attempts + 1;
    if v_attempts >= v_max then
      raise exception '產生推薦碼連續撞碼達 % 次，暫時無法配發，稍後由補償流程重試', v_max
        using errcode = 'internal_error';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.generate_referral_code() from anon, authenticated, public;
