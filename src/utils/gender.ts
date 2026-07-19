// 性別呈現的單一事實來源（SSOT）。
//
// 背景 / 為什麼需要這支：
// 原本 HomePage（手機卡片、桌面卡片）與 ServiceProviderDetail 各自用 inline 的
// `gender === '男' ? … : …` 重複判斷，並直接把 '♂' / '♀' 這兩個 Unicode 符號塞進
// Badge。這帶來兩個問題：
//   1. 邏輯重複（無 SSOT）：改一處容易漏掉其他兩處。
//   2. 渲染不穩定：♂ (U+2642)、♀ (U+2640) 屬於 Unicode emoji 集合，部分平台
//      （尤其 iOS Safari）會以「emoji 呈現」放大並上色，字形高度遠超過 text-xs 的
//      行高；當 Badge 帶有 overflow-hidden 且垂直內距被壓成 py-0 時，字形上下會被
//      裁掉，出現「破版、塞不進」的畫面。
//
// 解法：本模組集中性別 → 呈現資料的對應。UI 端優先用 iconName 對應到 lucide 的 SVG
// 圖示（各平台像素一致，沒有 emoji 呈現的問題）；純文字場景（例如下拉選單）則使用
// 帶有 U+FE0E（VARIATION SELECTOR-15）的符號，明確要求以「文字呈現」渲染。

/** 文字呈現選擇器：強制其前一個字元以一般文字（而非 emoji）渲染。 */
export const TEXT_PRESENTATION = '︎';

/** 系統支援的性別值（對齊 constants.ts 的 GENDER_OPTIONS）。 */
export type Gender = '男' | '女';

/** lucide 圖示名稱，供 UI 端對應到實際的 SVG 元件。 */
export type GenderIconName = 'mars' | 'venus';

export interface GenderDisplay {
  /** 原始值：男 / 女 */
  value: Gender;
  /** 中文標籤：男 / 女 */
  label: Gender;
  /** 性別符號（帶文字呈現選擇器，避免被算繪成 emoji）：♂︎ / ♀︎ */
  symbol: string;
  /** 符號 + 中文：♂ 男 / ♀ 女（符號同樣強制文字呈現） */
  symbolWithLabel: string;
  /** 對應的 lucide 圖示名稱 */
  iconName: GenderIconName;
  /** outline 樣式 Badge 的邊框 / 文字配色 */
  colorClass: string;
}

const MALE: GenderDisplay = {
  value: '男',
  label: '男',
  symbol: `♂${TEXT_PRESENTATION}`,
  symbolWithLabel: `♂${TEXT_PRESENTATION} 男`,
  iconName: 'mars',
  colorClass: 'border-blue-500 text-blue-600',
};

const FEMALE: GenderDisplay = {
  value: '女',
  label: '女',
  symbol: `♀${TEXT_PRESENTATION}`,
  symbolWithLabel: `♀${TEXT_PRESENTATION} 女`,
  iconName: 'venus',
  colorClass: 'border-pink-500 text-pink-600',
};

/**
 * 將任意 gender 欄位值正規化為呈現資料。
 *
 * 只接受明確的 '男' / '女'；空值、其他字串或非字串一律回傳 null，呼叫端據此決定是否
 * 顯示性別 Badge（比原本「非男即女」的 fallback 更正確，不會把未知值誤標成女性）。
 */
export function getGenderDisplay(gender: unknown): GenderDisplay | null {
  if (gender === '男') return MALE;
  if (gender === '女') return FEMALE;
  return null;
}
