// ============================================================
// 推薦網絡（Tier B 懶載入版）：前端型別 + 排序/倒數工具
//
// 後端三端點（/referrals/network/overview|children|search）為唯一資料
// 來源；節點為「扁平」形狀（無 children），樹由前端依 childCount 懶載入
// 組裝。排序在伺服器算：name_* 必須留在伺服器（前端只有遮罩後的顯示名），
// 而 updated_* 的鍵 joinedAt 雖然前端也拿得到，仍不下放——兩套排序等於
// 兩份真相。前端只負責記憶與傳遞 sort 參數。
//
// 型別一律從 @contract re-export，不再手抄第二份：先前這裡是獨立宣告的
// 鏡像，契約改欄位時漏改這邊，npm run check 與 deno task check 會「全綠」
// 而前端長期宣告一個 API 已不回傳的欄位——防線是單向的。
// ============================================================

import type {
  NetworkChildrenResponse,
  NetworkNode,
  NetworkOverviewResponse,
  NetworkSearchResponse,
  NetworkSortMode,
} from '@contract';
import { DEFAULT_NETWORK_SORT } from '@contract';

export { DEFAULT_NETWORK_SORT };
export type { NetworkNode, NetworkSortMode };

export type NetworkNodeStatus = NetworkNode['status'];
export type NetworkAttention = NetworkOverviewResponse['data']['attention'];
export type NetworkSummary = NetworkOverviewResponse['data']['summary'];
export type NetworkOverview = NetworkOverviewResponse['data'];
export type NetworkChildren = NetworkChildrenResponse['data'];
export type NetworkSearchMatch = NetworkSearchResponse['data']['matches'][number];

const SORT_MODES: readonly NetworkSortMode[] = [
  'updated_desc',
  'updated_asc',
  'name_asc',
  'name_desc',
];

/**
 * 排序選項（文案經需求方核定，測試釘死一字不差）。
 * 短文案是刻意的：收合的原生 select 顯示選中項全文，選項短（≤5 字）
 * 收合就短——單層結構、單一文字來源，從結構上消滅先前「晶片 + 透明
 * select 覆蓋」在 focus 時的疊字問題，窄螢幕也撐不爆搜尋列。
 */
export const SORT_OPTIONS: { value: NetworkSortMode; label: string }[] = [
  { value: 'updated_asc', label: '最早加入' },
  { value: 'updated_desc', label: '最新加入' },
  { value: 'name_asc', label: '姓名 A→Z' },
  { value: 'name_desc', label: '姓名 Z→A' },
];

/** 非法/未知值一律回落 DEFAULT_NETWORK_SORT（與伺服器 parseSortMode 同語意）。 */
export function parseSortMode(raw: unknown): NetworkSortMode {
  return (SORT_MODES as readonly unknown[]).includes(raw)
    ? (raw as NetworkSortMode)
    : DEFAULT_NETWORK_SORT;
}

export const SORT_STORAGE_KEY = 'referralSortMode';

/** 讀取上次選的排序；沒存過或被塞壞值都安全回落預設。 */
export function readStoredSort(): NetworkSortMode {
  try {
    return parseSortMode(localStorage.getItem(SORT_STORAGE_KEY));
  } catch {
    return DEFAULT_NETWORK_SORT;
  }
}

export function storeSort(mode: NetworkSortMode): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch {
    // storage 不可用（隱私模式）：不記憶即可，功能不受影響
  }
}

/**
 * 距到期天數：優先由 endDate 以「現在」重算（伺服器的 daysToExpiry 是回應
 * 當下的快照，頁面久開跨日會過時）；無 endDate 才 fallback 伺服器值。
 * 已過期 clamp 到 0，不出現負數倒數。
 */
export function nodeDaysLeft(node: {
  endDate: string | null;
  daysToExpiry: number | null;
}): number | null {
  if (node.endDate) {
    const ms = Date.parse(node.endDate);
    if (!Number.isNaN(ms)) return Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000));
  }
  return node.daysToExpiry;
}
