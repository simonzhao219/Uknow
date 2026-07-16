-- ============================================================
-- Uknow 後端重構 — 0001 (0717) 明確授與 service_role 資料表/函數權限
-- ============================================================
--
-- 背景：CI 的 api-tests 在全新資料庫（`supabase start` 用 latest CLI）
-- 上整批失敗：「permission denied for table payment_orders」。原因是
-- 我們的 migrations 從未明確 GRANT 任何權限給 service_role——一直以來
-- 都是靠 Supabase 平台/舊版 CLI 初始化時設定的 default privileges
-- （postgres 建立的物件自動授權給 anon/authenticated/service_role）。
-- 新版 CLI 建立的全新本地資料庫沒有這組預設值，service_role 就完全
-- 沒有資料表權限，edge function（用 service_role 連線）在那種環境
-- 一個查詢都跑不動。
--
-- 修正：把「service_role 對 public schema 有完整存取」這個一直依賴
-- 隱含預設的事實，改為在 migrations 內明確宣告。對已有 default
-- privileges 的環境（production）是冪等 no-op。
--
-- 刻意「只」授權 service_role：anon/authenticated 的權限維持各
-- migration 的明確控制（例如 0009 的 profiles 欄位級 update、0716
-- 0004/0005 對 system_alerts / referral_king_rewards 的 revoke all），
-- 一律不做 blanket grant，避免回退既有的安全強化。
-- ============================================================

grant usage on schema public to service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 未來 migrations 建立的新物件也自動授權（以執行 migrations 的角色
-- 所建立的物件為準）。
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
