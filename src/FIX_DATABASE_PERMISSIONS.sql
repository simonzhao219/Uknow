-- ========================================
-- 修復資料庫權限問題
-- ========================================
-- 錯誤：permission denied for table listings
-- 原因：表沒有正確的權限設置
-- 解決方案：授予所有必要的權限並禁用 RLS
-- ========================================

-- ========================================
-- 1. 授予 postgres 和 service_role 完整權限
-- ========================================

-- 授予 schema 權限
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

-- 授予所有表的權限
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 授予 anon 和 authenticated 角色讀取權限（用於公開端點）
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 授予 sequence 權限
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ========================================
-- 2. 設置預設權限（未來新建的表自動有權限）
-- ========================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- ========================================
-- 3. 禁用 Row Level Security (RLS) for 所有表
-- ========================================
-- 注意：這允許 service_role 直接訪問所有數據
-- Edge Functions 使用 service_role，所以需要禁用 RLS

ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS referral_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS referral_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reward_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reward_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS task_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS withdrawals DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS listings DISABLE ROW LEVEL SECURITY;

-- ========================================
-- 4. 明確授予每個表的權限
-- ========================================

-- Users 表
GRANT ALL ON TABLE users TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE users TO authenticated;
GRANT SELECT ON TABLE users TO anon;

-- Subscriptions 表
GRANT ALL ON TABLE subscriptions TO postgres, service_role;
GRANT SELECT ON TABLE subscriptions TO authenticated;

-- Referral Codes 表
GRANT ALL ON TABLE referral_codes TO postgres, service_role;
GRANT SELECT ON TABLE referral_codes TO authenticated, anon;

-- Referral Relationships 表
GRANT ALL ON TABLE referral_relationships TO postgres, service_role;
GRANT SELECT ON TABLE referral_relationships TO authenticated;

-- Reward Schedules 表
GRANT ALL ON TABLE reward_schedules TO postgres, service_role;
GRANT SELECT ON TABLE reward_schedules TO authenticated;

-- Reward History 表
GRANT ALL ON TABLE reward_history TO postgres, service_role;
GRANT SELECT ON TABLE reward_history TO authenticated;

-- Tasks 表
GRANT ALL ON TABLE tasks TO postgres, service_role;
GRANT SELECT ON TABLE tasks TO authenticated, anon;

-- Task Progress 表
GRANT ALL ON TABLE task_progress TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE task_progress TO authenticated;

-- Withdrawals 表
GRANT ALL ON TABLE withdrawals TO postgres, service_role;
GRANT SELECT, INSERT ON TABLE withdrawals TO authenticated;

-- Listings 表（公開可讀）
GRANT ALL ON TABLE listings TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE listings TO authenticated;
GRANT SELECT ON TABLE listings TO anon;

-- ========================================
-- 5. 驗證權限設置
-- ========================================

-- 查看 listings 表的權限
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='listings';

-- 查看 RLS 狀態
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- ========================================
-- 完成！
-- ========================================

SELECT 'Database permissions fixed successfully!' as message;
