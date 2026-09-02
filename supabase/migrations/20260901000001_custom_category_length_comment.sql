-- ============================================================
-- 同步 normalize_listing_category 的說明:產品規則從 10 字改成 6 字
-- ============================================================
--
-- 基準:20260807000004_normalize_listing_category_comment.sql。
-- **唯一差異:重寫 normalize_listing_category() 的 comment。
-- 不改動函數本體、不改動 trigger、不改動權限、不改動 20 字上限。**
--
-- 為什麼需要這一支:0004 的 comment 寫著
--
--     '20 字是防繞過 UI 的濫用上界,產品規則是前端的 CUSTOM_CATEGORY_MAX_LENGTH = 10。'
--
-- 前端的產品規則已於 2026-09-01 從 10 收到 6(判準改成「對齊內建類別的最長值」
-- ——自訂與內建在每個顯示點都並排,長度預期分兩套時長的那套先撞牆;實測手機
-- 預設的 3 欄照片牆在 375px 只放得下 8 個全形字)。comment 留在 10 就成了
-- 「資料庫自己宣稱的事實與程式碼不符」,而 `\df+` 與 Supabase Studio 都讀得到
-- 它——那正是 friction-log 2026-08-07「註解宣稱的機制不存在,而註解不會被任何
-- 閘門檢查」那一條的形狀。
--
-- 依 supabase/README.md「不要編輯已套用的 migration,修正一律新增一支並在檔頭
-- 寫明基準版本與唯一差異」,0003/0004 原樣保留。
--
-- **20 字的濫用上界刻意不跟著調降。** 它與產品規則職責不同(防的是繞過 UI 的
-- 寫入路徑),而且收窄它會傷到既有資料:調降前建立的 7–10 字類別仍在 listings
-- 裡,trigger 作用於 `before insert or update of category`,把上界壓到 6 會讓
-- 那些擁有者連「改自己刊登的其他欄位」都可能被擋下。
-- ============================================================

comment on function public.normalize_listing_category() is
  'listings.category 的寫入正規化（BEFORE INSERT OR UPDATE OF category）：'
  '非 ASCII 空白逐字轉半形、連續空白收成一個、去頭尾；空白字串與超過 20 字則拒收。'
  '存在理由：類別詞彙由 public_listing_categories 的 group by 推導，而那是逐字元比對，'
  '不正規化就會長出兩個看起來一樣的類別。20 字是防繞過 UI 的濫用上界，'
  '產品規則是前端的 CUSTOM_CATEGORY_MAX_LENGTH（2026-09-01 起為 6，對齊內建類別最長值）。'
  '兩者刻意不同步：產品規則只約束新輸入，而收窄這裡的上界會擋下既有長類別擁有者的一般編輯。'
  '註：本函數已 revoke execute from anon/authenticated/public，但那只是收斂對外介面——'
  'row-level trigger 觸發時不檢查寫入者的 EXECUTE 權限，撤銷不影響 trigger 運作。';
