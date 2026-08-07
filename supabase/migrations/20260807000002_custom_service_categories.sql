-- ============================================================
-- 自訂服務類別:類別詞彙的推導來源 + 資料層正規化防線
-- ============================================================
--
-- 需求:刊登者可在內建 30 類之外自訂服務類別;「只要還有一個人使用就留著,
-- 沒有任何人使用就直接刪除」。
--
-- 為什麼不另存一張 service_categories 表:那句需求本質是引用計數,而另存
-- 一張表就得靠 trigger 或排程回收——兩份真相會漂移(孤兒類別、漏刪、競態)。
-- 改成從 listings 推導之後,`group by` 本身就是引用計數,**沒有任何東西需要
-- 刪除**,那條規則從「一段要維護的清理邏輯」變成不可能違反的恆等式。
--
-- 兩個物件:
--   1. public_listing_categories —— 推導來源(view)
--   2. normalize_listing_category —— 寫入時的正規化 trigger
-- 皆為新增物件,不改動任何既有 table / column / RLS policy,可乾淨回滾。
-- ============================================================

-- ------------------------------------------------------------
-- 1. public_listing_categories:目前「有人在用」的類別與使用數
-- ------------------------------------------------------------
--
-- 疊在 public_listings 之上而不是直接建在 listings 上:可見性規則
-- (has_active_subscription)因此只定義一次。連帶語意——會籍過期或被停權的
-- 擁有者,其刊登整筆從全站消失,他用的類別若沒有其他人在用也一起消失,
-- 續約/解除停權後自動回來。「使用」= 目前**可見**的刊登在用。
--
-- security_invoker = on:與 public_listings 一致,不繞過 RLS。權限鏈是
-- 呼叫者 → public_listing_categories → public_listings → listings,
-- 每一段都以呼叫者身分評估。
--
-- 為什麼要有這個 view,而不是讓前端 select('category') 自己 distinct:
-- PostgREST 有預設列數上限(常見 1000),刊登數超過上限時類別清單會**靜默
-- 截斷**——下拉選單少了幾個類別,沒有任何錯誤訊息。view 一個類別一列,
-- payload 與刊登數無關。
--
-- ⚠️ group by 的結果**包含內建 30 類**(絕大多數刊登本來就選內建類別)。
-- 「自訂類別」的定義是「本 view 回傳列 − SERVICE_CATEGORIES」,由前端的
-- deriveCustomCategories() 一處實作(src/utils/serviceCategories.ts)。
create view public.public_listing_categories
with (security_invoker = on) as
select
  l.category,
  count(*)::int as listing_count
from public.public_listings l
group by l.category;

comment on view public.public_listing_categories is
  '目前有可見刊登在使用的服務類別與使用數。自訂類別的生命週期完全由此推導：'
  '沒有任何可見刊登使用的類別不會出現在這裡，因此不需要任何清理邏輯。'
  '含內建類別，前端負責扣除 SERVICE_CATEGORIES 後得到自訂類別。';

-- 訪客首頁的篩選器要列出可篩的類別,所以 anon 必須讀得到(與 public_listings
-- 同一組 grant 對象)。
grant select on public.public_listing_categories to anon, authenticated;

-- ------------------------------------------------------------
-- 2. listings.category 的寫入正規化
-- ------------------------------------------------------------
--
-- 為什麼資料層也要有一道:類別詞彙是 `group by category` 推導的,而那是逐
-- 字元比對——「美髮 」與「美髮」會變成兩個類別,篩選器長出兩顆看起來一模
-- 一樣的 chip,各自篩到不同的刊登。前端的 normalizeCategoryInput() 擋得住
-- 走 UI 的路徑,但 listings 的 RLS 只檢查 user_id、不檢查值的形狀,任何
-- 繞過該元件的寫入(直接打 REST、日後第二個表單、實作 bug)都能塞進近似
-- 重複字串。
--
-- 為什麼是 trigger 不是 CHECK constraint:CHECK 會在 ALTER TABLE 當下驗證
-- **既有**資料,對線上資料有未知風險(驗證失敗 = 部署失敗)。trigger 只作用
-- 於新寫入,既有列一律不動。
--
-- 20 字是**濫用上界**,不是產品規則。產品規則是前端的
-- CUSTOM_CATEGORY_MAX_LENGTH = 10;這裡放寬是因為兩者職責不同——前端定義
-- 「使用者被允許輸入多長」,這裡防的是「繞過前端能塞多長」。既有內建類別
-- 最長 6 字,不受影響。
create or replace function public.normalize_listing_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 內部連續空白收成一個半形空格,再去頭尾。
  --
  -- 為什麼先 translate() 再 regexp_replace(),而不是直接靠 `\s`:
  -- Postgres 的 `\s` 等價於 `[[:space:]]`,而該字元類是否包含**全形空白**
  -- (U+3000)、不斷行空白(U+00A0)等非 ASCII 空白,取決於資料庫的 ctype
  -- 設定——讀 SQL 判斷不出來,不同環境還可能給不同答案。前端的 JS `\s`
  -- **確定**包含這些字元(ECMAScript 明文規定),兩邊不一致就等於「UI 收斂了、
  -- 資料層沒收斂」,而這道 trigger 存在的唯一理由就是擋近似重複字串——
  -- 把破口留在自己要守的地方沒有道理。translate() 逐字對應,不依賴 locale。
  -- translate() 的兩個字串逐字對應,長度必須相同(各 8 個字元):
  --   U+3000 全形空白 / U+00A0 不斷行空白 / U+2002 en space /
  --   U+2003 em space / U+2009 thin space / tab / LF / CR  →  半形空格 ×8
  -- 用跳脫序列而非字面字元:全形空白在原始碼裡看不見,
  -- 而一個看不見的字元被誤刪同樣看不見。
  new.category := btrim(
    regexp_replace(
      translate(
        new.category,
        E'\u3000\u00A0\u2002\u2003\u2009\t\n\r',
        '        '
      ),
      '\s+',
      ' ',
      'g'
    )
  );

  -- 不指定 errcode:預設的 P0001 讓 PostgREST 回 400(輸入格式不對),
  -- 而 class 23(check_violation)會被對應成 409「衝突」——那個語意會誤導
  -- 未來加狀態碼分支的錯誤處理,讓它以為重試有意義。目錄下其餘 raise
  -- exception 也都用預設。
  if new.category = '' then
    raise exception '服務類別不得為空白';
  end if;

  if char_length(new.category) > 20 then
    raise exception '服務類別超過長度上限（20 字）';
  end if;

  return new;
end;
$$;

-- 比照 20260620000008 對 trigger 函數的處置:trigger 函數不該能被前端直接呼叫。
revoke execute on function public.normalize_listing_category() from anon, authenticated, public;

create trigger listings_normalize_category
  before insert or update of category on public.listings
  for each row execute function public.normalize_listing_category();
