-- 會員驗證稽核：admin_id → verifier_id（掃描開放給會籍有效的會員之後）
--
-- 20260726000003 建表時，掃碼驗證只有管理員做得到，欄位就叫 admin_id。規格 §13.1
-- 改為「會籍有效的會員或管理員」都能掃之後，這個欄位存的多半是一般會員——名字
-- 與內容不符。
--
-- 為什麼這次選擇改名，而不是沿用本 repo 既有的「留欄名、加註解標記語意已變」
-- 慣例（is_canceled / grace_period_end / registration_step 三個前例）：那些是業務
-- 欄位，讀錯了頂多多問一句；這張表是**資安稽核的追溯來源**，欄名叫 admin_id 會
-- 讓查表的人把一般會員的掃描誤讀成管理員行為，而稽核最需要的就是「誰做的」不能
-- 被誤讀。這是全 repo 第一支 rename column，影響面已核實只有 Edge Function 一個
-- 讀寫端與兩支 Deno 測試。
--
-- rename column 的安全性：FK（on delete set null）與既有索引都隨欄位保留，不需
-- 重建；無資料搬移。部署期兩個方向都有短暫視窗（migration 先套用時舊版函數仍寫
-- admin_id、函數先換版時新版寫 verifier_id 而欄位還沒改名），兩者都會被稽核的
-- fail-closed 擋成 500——驗證失敗、但不會寫錯資料。

alter table public.member_verify_logs rename column admin_id to verifier_id;
alter index member_verify_logs_admin_idx rename to member_verify_logs_verifier_idx;

comment on table public.member_verify_logs is
  '會員身分驗證稽核：會籍有效的會員或管理員掃碼驗證成功時逐次寫入（append-only）。查閱走 Supabase Studio，本期無前端介面。';

comment on column public.member_verify_logs.verifier_id is
  '掃描者（會籍有效的會員或管理員）。建表時名為 admin_id，開放會員互掃後更名。';
