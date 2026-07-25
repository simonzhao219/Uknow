import { REWARD_SOURCE_CATEGORIES } from '@contract';
import type { RewardSourceCategory, RewardSourceFacet } from '@contract';

/**
 * 獎勵明細「來源篩選」的資料模型（純資料＋純函式，元件只負責畫）。
 *
 * 模型是**平列多選**：選取集合為空＝全部。使用者想同時看兩三種來源是常見
 * 需求（例如「推薦新人 + 子代續約」＝我所有的進帳），兩層單選會逼他們在
 * 「只能看一種」與「只能看全部」之間二選一。
 *
 * 兩個版面原則讓多選不會把篩選器撐成鋸齒：
 *   1. 篩選器用**短標籤**（推薦新人／子代續約／提領／退還），明細列 badge 才
 *      用完整名稱（獎勵-推薦新人…）。兩者本來就不必是同一字串：一列一列掃
 *      明細時標籤要能自我解釋，但並排的 chip 上「獎勵-」前綴是重複雜訊。
 *   2. 選項由後端 facet 決定（見 rewardFilterOptions），空分類根本不出現。
 *
 * 「全選」永遠歸位成「全部」（空集合），避免兩個語意相同但行為不同的狀態
 * ——逐列餘額只在「全部」顯示，若全選是另一個狀態，同樣的可見清單會有兩種
 * 餘額行為。
 */

/**
 * 明細列 badge 用的完整標籤（文字的單一真相）。
 * 分類軸是「拉新／續約」，與 view 的 source_category 一一對應
 * （見 migration 0725 0002）。
 */
export const REWARD_SOURCE_LABELS: Record<RewardSourceCategory, string> = {
  referral_signup: '獎勵-推薦新人',
  referral_renewal: '獎勵-子代續約',
  withdrawal: '提領 Point',
  withdrawal_refund: '退還 Point',
  adjustment_manual: '其他調整',
};

/** 篩選 chip 用的短標籤：並排時前綴是雜訊，只留差異詞。 */
export const REWARD_FILTER_LABELS: Record<RewardSourceCategory, string> = {
  referral_signup: '推薦新人',
  referral_renewal: '子代續約',
  withdrawal: '提領',
  withdrawal_refund: '退還',
  adjustment_manual: '其他調整',
};

/** 顯示順序＝契約 enum 的順序（進帳 → 出帳 → 調整），CSV 也照這個序。 */
const SOURCE_ORDER: readonly RewardSourceCategory[] = REWARD_SOURCE_CATEGORIES;

/** 選取的來源集合；空陣列＝全部（不帶 ?source=）。 */
export type RewardHistoryFilter = readonly RewardSourceCategory[];

export const ALL_REWARD_FILTER: RewardHistoryFilter = [];

export interface RewardFilterOption {
  source: RewardSourceCategory;
  /** 短標籤 */
  label: string;
  /** 該分類的總筆數（未篩選全集） */
  count: number;
}

/**
 * facet → 篩選選項（固定順序）。
 * 只列出「這位使用者實際有」的分類：沒有的不出現（永遠篩不到東西的 chip 是
 * 雜訊），schema 允許但前端沒預期的分類（人工調整）真的出現時會自動長出來
 * ——各 chip 筆數加總永遠等於「全部」的總數。
 */
export function rewardFilterOptions(facets: readonly RewardSourceFacet[]): RewardFilterOption[] {
  return SOURCE_ORDER.flatMap((source) => {
    const facet = facets.find((f) => f.sourceCategory === source);
    if (!facet || facet.count <= 0) return [];
    return [{ source, label: REWARD_FILTER_LABELS[source], count: facet.count }];
  });
}

/**
 * 切換一個來源。
 * 全部選滿時歸位成「全部」（空集合）——見檔頭：避免兩個等價卻行為不同的狀態。
 * 回傳一律照 SOURCE_ORDER 排序，讓相同集合有唯一表示（?source= 才不會因點選
 * 順序不同而變成不同字串，快取與測試都好對）。
 */
export function toggleRewardSource(
  selected: RewardHistoryFilter,
  source: RewardSourceCategory,
  available: readonly RewardSourceCategory[],
): RewardHistoryFilter {
  const next = selected.includes(source)
    ? selected.filter((s) => s !== source)
    : [...selected, source];
  const kept = SOURCE_ORDER.filter((s) => next.includes(s) && available.includes(s));
  return kept.length === available.length ? ALL_REWARD_FILTER : kept;
}

/**
 * 選取狀態 → 後端 `?source=` 的值（CSV）。
 * 回傳 '' 代表不帶 param＝全部。篩選與 count 都在 DB 端算
 * （見 supabase/functions/api/index.ts 的 /rewards/history）。
 */
export function toRewardSourceParam(filter: RewardHistoryFilter): string {
  return filter.join(',');
}

/** 是否處於篩選中（決定逐列餘額是否顯示、空狀態文案用哪句）。 */
export function isRewardFilterActive(filter: RewardHistoryFilter): boolean {
  return filter.length > 0;
}

/** 目前篩選的顯示名稱（空狀態文案用，完整標籤）；全部時回 null。 */
export function rewardFilterLabel(filter: RewardHistoryFilter): string | null {
  if (!filter.length) return null;
  return filter.map((s) => REWARD_SOURCE_LABELS[s]).join('、');
}
