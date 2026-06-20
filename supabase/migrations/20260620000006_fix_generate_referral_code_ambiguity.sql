-- ============================================================
-- Uknow 後端重構 — 0006 修正 generate_referral_code 變數歧義
-- ============================================================
--
-- 問題：函數內的變數 code 與 referral_codes.code 欄位同名，
--       在 WHERE rc.code = code 造成 "column reference is ambiguous"。
-- 修正：變數改名為 v_code。
-- ============================================================

create or replace function public.generate_referral_code()
returns text language plpgsql set search_path = public as $$
declare
  letters text := 'abcdefghijklmnopqrstuvwxyz';
  digits  text := '0123456789';
  v_code  text;
  i       int;
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
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.generate_referral_code() from anon, authenticated, public;
