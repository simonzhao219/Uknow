import { SERVICE_CATEGORIES } from './constants';

/**
 * 自訂服務類別的領域規則。
 *
 * 類別詞彙**推導自實際使用中的刊登**,不另存一張表——需求「沒有任何人使用
 * 就直接刪除」因此是 `group by` 的恆等式,而不是一段要維護的清理邏輯。
 * 資料來源是 `public_listing_categories` view(見 migration
 * `20260807000002_custom_service_categories.sql`)。
 *
 * 這個檔案是**純函式層**:不碰網路、不碰 React。UI 只負責把使用者輸入交給
 * 這裡,再把結果放回 state。
 */

/**
 * 下拉選單裡「自訂類別…」那一項的值。
 *
 * Radix Select 不接受空字串當 value,所以必須是個真字串;而只要是真字串,
 * 使用者就可能把它當成類別名稱打進去(不論有意或碰巧)。`validateCustomCategory`
 * 因此明確拒收它——sentinel 與資料同域時,防冒用不能靠「不會有人這樣打」。
 */
export const CUSTOM_CATEGORY_SENTINEL = '__custom__';

/**
 * 自訂類別長度上限(產品規則)。
 *
 * 判準:內建類別最長 6 字(「各項運動教練」「各類音樂老師」),服務者名稱上限
 * 10 字(`NAME_MAX_LENGTH`)——類別不該比名稱長。10 個全形字在 375px 的卡片
 * 徽章仍能單行呈現。
 *
 * 資料庫的 trigger 另有一道 20 字的硬上限,那是**濫用上界**不是產品規則:
 * 它防的是繞過這個 UI 的寫入路徑,兩個數字職責不同,不是漂移。
 */
export const CUSTOM_CATEGORY_MAX_LENGTH = 10;

/**
 * 不得被拿來當自訂類別的字串。
 *
 * 「全部類別」是篩選器裡「不套用類別條件」那顆 chip 的文字。若真有刊登用它
 * 當類別,篩選器會出現兩顆同字的 chip,而其中一顆的行為與它的文字相反。
 */
const RESERVED_CATEGORY_LABELS = ['全部類別'];

/**
 * 送出前的正規化:去頭尾空白、內部連續空白收成一個半形空格。
 *
 * **只在 commit 時呼叫,絕不在 onChange 裡呼叫**——受控 input 的值在 IME
 * 組字期間被改寫,WebKit 會丟掉 composition range 卻不清 IME 緩衝,注音符號
 * 整串累積殘留(見 `src/hooks/useImeComposition.ts` 與 PR #212)。
 */
export function normalizeCategoryInput(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * 比對用的鍵。NFKC 把全形英數摺成半形(Ａ→A),再轉小寫。
 *
 * 只用於**比對**,不用於儲存:儲存的是使用者實際打的字(正規化空白之後)。
 * 所以先建立「ＡＢＣ」的人決定了canonical 寫法,後來打「abc」的人會被收斂
 * 過去——這正是 A4 要的行為(不產生近似重複的類別)。
 */
function categoryMatchKey(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/**
 * 在既有類別裡找出與 `raw` 等價的那一個;找不到回 null。
 *
 * 「等價」= 空白正規化 + NFKC + 大小寫摺疊之後相同。
 */
export function findCanonicalCategory(raw: string, known: readonly string[]): string | null {
  const key = categoryMatchKey(normalizeCategoryInput(raw));
  if (key === '') return null;
  return known.find((candidate) => categoryMatchKey(candidate) === key) ?? null;
}

export interface CustomCategoryResult {
  /** 可送出的類別值;有 error 時為空字串。 */
  value: string;
  /** 使用者看得到的錯誤訊息;通過時為 null。 */
  error: string | null;
  /**
   * 這次輸入被收斂到既有類別(而非建立新類別)時,填該類別名稱。
   * UI 用它顯示「將歸入既有類別「X」」——不提示的話,使用者不會知道
   * 自己打的字被換掉了。
   */
  matchedExisting: string | null;
}

/**
 * 驗證並解析使用者輸入的自訂類別。
 *
 * `known` 應包含內建類別與目前存在的自訂類別;呼叫端負責合併
 * (見 `allKnownCategories`)。
 */
export function validateCustomCategory(
  raw: string,
  known: readonly string[],
): CustomCategoryResult {
  const value = normalizeCategoryInput(raw);
  const reject = (error: string): CustomCategoryResult => ({
    value: '',
    error,
    matchedExisting: null,
  });

  if (value === '') {
    return reject('請輸入自訂類別');
  }
  if (value.length > CUSTOM_CATEGORY_MAX_LENGTH) {
    return reject(`自訂類別最多 ${CUSTOM_CATEGORY_MAX_LENGTH} 字`);
  }
  if (value === CUSTOM_CATEGORY_SENTINEL || RESERVED_CATEGORY_LABELS.includes(value)) {
    return reject('這個名稱已被系統保留,請換一個');
  }

  const canonical = findCanonicalCategory(value, known);
  return {
    value: canonical ?? value,
    error: null,
    // 比對的是**使用者原始輸入**而非正規化後的值:提示要回答的問題是
    // 「我打的字被換掉了嗎」。拿正規化後的值去比,「美髮 」(尾巴一個空白)
    // 會被判成沒有改寫,而使用者送出的確實不是他打的那串。
    matchedExisting: canonical !== null && canonical !== raw ? canonical : null,
  };
}

/** `public_listing_categories` view 的一列。 */
export interface CategoryUsageRow {
  category: string;
  listing_count: number;
}

/**
 * 從 view 的回傳列推導出「自訂類別」。
 *
 * ⚠️ view 的 `group by` **包含內建 30 類**(絕大多數刊登本來就選內建類別),
 * 所以自訂類別的定義必須是 **view 回傳列 − `SERVICE_CATEGORIES`**。
 * 直接渲染原始列會讓內建類別在下拉選單出現兩次。
 *
 * 排序:使用數多的在前(對後來的人比較可能有用),同數以中文字序穩定收斂
 * ——排序不穩定時,UI 會在每次重新抓取後跳動。
 */
export function deriveCustomCategories(rows: readonly CategoryUsageRow[]): string[] {
  const builtIn = new Set(SERVICE_CATEGORIES);
  return rows
    .filter((row) => typeof row.category === 'string' && row.category !== '')
    .filter((row) => !builtIn.has(row.category))
    .slice()
    .sort(
      (a, b) =>
        b.listing_count - a.listing_count || a.category.localeCompare(b.category, 'zh-Hant'),
    )
    .map((row) => row.category);
}

/**
 * 全部可選類別:內建在前(維持規格書 §12.1 的分組順序),自訂接在後面。
 *
 * `current` 是「這筆刊登目前用的類別」。把它併進來是 A9 不變式:
 * 不論自訂類別清單抓到了沒,`<Select value={current}>` 一定配得到一個
 * `SelectItem`。少了這一步,編輯一筆自訂類別的刊登時下拉會顯示成未選擇,
 * 使用者以為類別被清空而手動重選——原本的自訂類別就這樣被覆蓋掉。
 */
export function allKnownCategories(
  customCategories: readonly string[],
  current?: string,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const category of [...SERVICE_CATEGORIES, ...customCategories, current ?? '']) {
    if (category === '' || seen.has(category)) continue;
    seen.add(category);
    merged.push(category);
  }
  return merged;
}
