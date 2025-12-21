-- ========================================
-- 檢查資料庫狀態
-- ========================================
-- 用於診斷權限問題
-- ========================================

-- ========================================
-- 1. 檢查是否有表存在
-- ========================================

SELECT 
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ========================================
-- 2. 檢查 users 表的欄位（確認 schema 版本）
-- ========================================

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'users'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ========================================
-- 3. 檢查 listings 表的權限
-- ========================================

SELECT 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'listings'
  AND table_schema = 'public';

-- ========================================
-- 4. 檢查 RLS (Row Level Security) 狀態
-- ========================================

SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ========================================
-- 5. 檢查當前角色
-- ========================================

SELECT current_user, session_user;

-- ========================================
-- 6. 檢查資料庫中是否有數據
-- ========================================

SELECT 
    'users' as table_name,
    COUNT(*) as row_count
FROM users
UNION ALL
SELECT 
    'listings' as table_name,
    COUNT(*) as row_count
FROM listings
UNION ALL
SELECT 
    'referral_codes' as table_name,
    COUNT(*) as row_count
FROM referral_codes;
