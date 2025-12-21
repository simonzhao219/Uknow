-- ========================================
-- Uknow 平台資料庫完全清理腳本
-- ========================================
-- ⚠️ 警告：此腳本會刪除所有現有的表和數據！
-- ⚠️ 請確認您真的要清空資料庫再執行！
-- ========================================

-- 1. 刪除所有表（如果存在）
DROP TABLE IF EXISTS public.reward_schedules CASCADE;
DROP TABLE IF EXISTS public.withdrawals CASCADE;
DROP TABLE IF EXISTS public.rewards CASCADE;
DROP TABLE IF EXISTS public.listings CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. 確認清理完成
SELECT 'All tables dropped successfully!' as status;
