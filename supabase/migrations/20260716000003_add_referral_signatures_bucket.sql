-- ============================================================
-- Uknow 後端重構 — 0716-3 建立推薦計畫簽名圖片的私有 bucket
-- ============================================================
-- 加入推薦計畫（POST /referrals/join-program）需要把使用者的手寫簽名
-- 上傳到 Storage。這個 bucket 之前只存在於已淘汰的 make-server-5c6718b9
-- 死碼裡，從未在現行專案建立過。
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('referral-signatures', 'referral-signatures', false, 2097152)
on conflict (id) do nothing;
