-- ============================================================
-- Uknow — 0805 補建刊登照片 bucket（歷史上只在 production 手動建過）
-- ============================================================
-- /listings/upload-photo 寫入 make-5c6718b9-listings-photos，但這個
-- bucket 從未被任何 migration 建立——它是 make-server 時代直接在
-- production 手動建的。任何「從 migration 長出來」的全新環境（journey
-- 拋棄式分支、本地 supabase start）都沒有它：上傳回 500、照片永遠到
-- 不了 3 張、「建立刊登」按鈕永遠 disabled（2026-08-04 run 30944836300
-- 的 f40 四連敗即此因）。
--
-- 這與 0008 的教訓同類：手動建立的環境狀態必須回填進 migration，
-- 否則炸的是下一個從零重建的環境。設定照抄 production 現值
-- （public、5MB——public 是因為刊登照片以 getPublicUrl 直出）。
-- 對 production 本身 on conflict do nothing，冪等安全。
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('make-5c6718b9-listings-photos', 'make-5c6718b9-listings-photos', true, 5242880)
on conflict (id) do nothing;
