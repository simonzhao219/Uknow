-- ============================================================
-- 更正 normalize_listing_category 的說明:引錯前例 + 補資料庫層註解
-- ============================================================
--
-- 基準:20260807000003_custom_service_categories.sql。
-- **唯一差異:替 normalize_listing_category() 加上 comment on function。
-- 不改動函數本體、不改動 trigger、不改動權限。**
--
-- 為什麼需要這一支:0003 的第 125 行行內註解寫著
--
--     -- 比照 20260620000008 對 trigger 函數的處置:trigger 函數不該能被前端直接呼叫。
--
-- 這句引錯前例。20260620000008 撤銷的是 `rls_auto_enable()`,那是 **event
-- trigger** 函數;`normalize_listing_category()` 是 **row-level trigger** 函數,
-- 兩者不是同一回事,該前例不成立。
--
-- 引錯前例比不引更糟:它讓後人以為這個處置有先例背書,因而不再查證。
-- (本 repo 的 friction-log 2026-08-07 有一條同類:「註解宣稱的機制不存在,
-- 而註解不會被任何閘門檢查」。)
--
-- 依 supabase/README.md「不要編輯已套用的 migration,修正一律新增一支並在
-- 檔頭寫明基準版本與唯一差異」,0003 的行內註解原樣保留,正確的說明改放在
-- 資料庫物件本身——`\df+` 與 Supabase Studio 都看得到,比藏在 migration
-- 檔案裡的行內註解更容易被讀到。
--
-- 順帶釐清那行 `revoke execute` 的實際效果(0003 沒講清楚的部分):
-- 它**不是** trigger 能否運作的前提。PostgreSQL 觸發 row-level trigger 時
-- 不檢查寫入者對 trigger 函數的 EXECUTE 權限,所以撤銷之後 anon/authenticated
-- 的 INSERT/UPDATE 照樣會跑到正規化邏輯。那行純粹是收斂對外介面
-- (讓函數不出現在 /rest/v1/rpc 的可呼叫面上、消掉 security advisor 警告)。
-- ============================================================

comment on function public.normalize_listing_category() is
  'listings.category 的寫入正規化（BEFORE INSERT OR UPDATE OF category）：'
  '非 ASCII 空白逐字轉半形、連續空白收成一個、去頭尾；空白字串與超過 20 字則拒收。'
  '存在理由：類別詞彙由 public_listing_categories 的 group by 推導，而那是逐字元比對，'
  '不正規化就會長出兩個看起來一樣的類別。20 字是防繞過 UI 的濫用上界，'
  '產品規則是前端的 CUSTOM_CATEGORY_MAX_LENGTH = 10。'
  '註：本函數已 revoke execute from anon/authenticated/public，但那只是收斂對外介面——'
  'row-level trigger 觸發時不檢查寫入者的 EXECUTE 權限，撤銷不影響 trigger 運作。';
