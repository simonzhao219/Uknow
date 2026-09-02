/**
 * 首頁關鍵字搜尋的比對判定。
 *
 * 抽成純函式（而非留在 `HomePage.tsx` 的 useMemo 裡）的理由，就是它原本
 * 沒有測試落點：搜尋框的 placeholder 寫「搜尋服務者名稱、服務內容或標籤」，
 * 而 haystack 只有 name + description——`category` 從來不在比對範圍內，
 * 使用者打「寵物美容」得到 0 筆，而 UI 上沒有任何線索說明為什麼。
 * 文案承諾與實際行為的落差，只有在承諾本身有斷言時才擋得住。
 *
 * 與 `listingMatchesDistricts`（districtSelection.ts）同一個模式：首頁的每個
 * 篩選維度都是可以單獨驗的純判定，HomePage 只負責把它們串起來。
 */

/** 比對範圍——只取需要的欄位，讓測試不必湊出一整筆 ListingRow。 */
export interface SearchableListing {
  name: string;
  description: string;
  category: string;
}

/**
 * 刊登是否命中關鍵字。空字串（或只有空白）一律視為不套用搜尋條件。
 *
 * `category` 必須在比對範圍內：自訂類別在篩選面板裡是收合的（超過門檻時只
 * 露出使用數前幾名），搜尋是它的第二條入口。少了這一條，一個冷門的自訂類別
 * 在 UI 上就是找不到——chip 被收起來、搜尋又打不到。
 */
export function listingMatchesSearch(query: string, listing: SearchableListing): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [listing.name, listing.description, listing.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(needle);
}
