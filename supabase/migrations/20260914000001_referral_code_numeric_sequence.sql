-- ============================================================
-- Uknow — 0914 (1) 推薦碼改為數字流水號（8048876 起）
-- ============================================================
--
-- 原本：`generate_referral_code()` 抽 3 碼小寫英文 + 6 碼數字
-- （`abc123456`），撞號重抽。改為單調遞增的數字流水號，第一個發出的
-- 碼是 8048876，之後 8048877、8048878……
--
-- 設計要點：
-- * **起始值 8048876 是結構事實，不是可調參數**，所以寫在 migration 裡
--   而非 reward_config。序列一旦開始發碼就不該被改動——改了會讓後發的
--   碼與先發的碼重疊，而 `referral_codes.code` 的 unique 約束會把它變成
--   發碼失敗（被 3a 的 exception 攔成 warning，付款照樣成功但沒有碼）。
-- * **`if not exists` 而非 `alter sequence restart`**：journey 的拋棄式
--   分支會從零重播全部 migration，重播時序列本來就不存在、自然從
--   8048876 起；而在已部署的環境重跑此檔時必須**保留當下值**。用
--   restart 會把正式站的序列倒轉回 8048876，直接製造撞號。
-- * **保留撞號重試迴圈**。序列自己不會發出重複值，但營運有可能手動
--   `insert` 或 `update` 過某個數字碼（見 supabase-setup-checklist 步驟 6
--   的歷史作法）。少了這圈，那種碼會讓 `generate_referral_code()` 回一個
--   注定違反 unique 約束的值。迴圈讓函數維持原本的契約：回傳的碼保證可用。
-- * 權限姿態比照原函數：執行權限不開放給 anon/authenticated。實際呼叫者
--   是 `apply_referral_side_effects`（security definer），nextval 走定義者
--   權限，不需要把序列開放出去。
-- * 發碼時機不變——仍是首次付款成功時由 `apply_referral_side_effects`
--   的 3a 段產生，續約／補償沿用既有 active 碼。序號因此只消耗在真正
--   付費的會員身上。
--
-- 連帶：8048876 同時是 §7.4 預設推薦人的指定碼。啟用仍是可追溯的人工
-- `UPDATE reward_config`（本檔刻意不寫入），但營運不必再手改碼——第一個
-- 發出的碼天生就是 8048876。部署步驟見 docs/supabase-setup-checklist.md 步驟 6。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 序列：推薦碼號源
-- ------------------------------------------------------------
create sequence if not exists public.referral_code_seq
  as bigint
  increment by 1
  no maxvalue
  start with 8048876
  no cycle;

comment on sequence public.referral_code_seq is
  '推薦碼號源，8048876 起單調遞增。起始值是結構事實、非可調參數，'
  '開始發碼後不得 restart（會與已發出的碼重疊）。'
  '交易 rollback 會消耗掉一個號，所以號碼連續但可能有極少數空洞——'
  '碼只是識別字串，空洞不影響任何業務規則。';

revoke all on sequence public.referral_code_seq from anon, authenticated, public;

-- ------------------------------------------------------------
-- 2. generate_referral_code()：亂數 → 流水號
-- ------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text language plpgsql set search_path = public as $$
declare
  v_code text;
begin
  -- 迴圈只為了跳過「已被人工佔用的數字碼」，序列自己不會重複。
  loop
    v_code := nextval('public.referral_code_seq')::text;
    exit when not exists (select 1 from public.referral_codes rc where rc.code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.generate_referral_code() from anon, authenticated, public;

-- ------------------------------------------------------------
-- 3. 欄位註解：格式說明的單一真相搬到這裡
--    （0620 0001 的 `-- 格式：abc123456` 已是歷史，不回頭改已套用的檔）
-- ------------------------------------------------------------
comment on column public.referral_codes.code is
  '推薦碼：數字流水號，由 referral_code_seq 發出，8048876 起。'
  '不分大小寫的正規化（lower/trim）仍保留在各寫入點，對純數字是 no-op。'
  '2026-09-14 前發出的碼為舊格式「3 碼小寫英文 + 6 碼數字」，仍然有效。';
