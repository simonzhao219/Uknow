-- ============================================================
-- Uknow — 標註 profiles.registration_step 為「已停用/不可信任」的歷史欄位
-- ============================================================
--
-- 背景：
--   註冊漏斗的「進度」真相來源自 migration 0011 起已改為即時計算的
--   effective_registration_step(uuid)（0007 事故後再由 0004 修正為
--   「資料未填齊回 0」）。buildProfileResponse 回給前端的 registrationStep
--   一律取自該函式，不再讀這個手動維護的欄位。
--
--   但欄位本身仍留著且語意已與系統分歧，是一個「會說謊的欄位」：
--     * 定義為 `default 1 check (registration_step in (1,2,3))` —— 連
--       effective 版本會回傳的 0（基本資料未填）都無法表達。
--     * 仍被 /auth/register（寫 1）與 process_successful_payment（寫 3）
--       寫入，卻沒有任何授權判斷會去「讀」它做決策。
--
--   若後續開發者誤把它當成真相來源（例如 `where registration_step = 1`），
--   就會重演空白結帳頁那一類「step 與實際資料不一致」的事故。
--
-- 這個 migration 不改任何行為、不動 schema/約束，只用 COMMENT 把欄位與
-- 函式的關係寫進資料庫 metadata，讓下一個人一眼看到「別信這個欄位、
-- 要用 effective_registration_step」。真正的清理（停止寫入或移除欄位）
-- 涉及 API 與除錯端點的改動，範圍較大，留待後續評估，不在本次動。
-- ============================================================

comment on column public.profiles.registration_step is
  'DEPRECATED / 不可信任。註冊進度的單一真相來源是 effective_registration_step(user_id)（即時計算，可回 0/1/2/3）。'
  '本欄位為手動維護的歷史遺留，受 check(1,2,3) 限制無法表達「基本資料未填(0)」，'
  '且沒有任何授權決策會讀它——僅 /auth/register 與 process_successful_payment 仍在寫入。'
  '請勿用本欄位做導向/門禁判斷，改呼叫 effective_registration_step()。';

comment on function public.effective_registration_step(uuid) is
  '註冊漏斗進度的單一真相來源（SSOT），取代不可信任的 profiles.registration_step 欄位。'
  '即時計算：有 completed 訂單→3；有 pending 訂單→2；無訂單但基本資料(name/phone/birth_date)填齊→1；否則→0。'
  '與前端 isProfileComplete() 同一套「資料是否填齊」定義。';
