// ============================================================
// 推薦網絡（Tier B 懶載入版）：前端型別 + 排序/倒數工具
//
// 後端三端點（/referrals/network/overview|children|search）為唯一資料
// 來源；節點為「扁平」形狀（無 children），樹由前端依 childCount 懶載入
// 組裝。排序在伺服器算（真名 + Intl.Collator），前端只負責記憶與傳遞
// sort 參數——遮罩後的顯示名無法在前端做正確的姓名排序，這是刻意分工。
// ============================================================

export type NetworkSortMode = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';
export type NetworkNodeStatus = 'active' | 'expiring' | 'expired' | 'suspended';

/** 推薦網絡節點（扁平；姓名於伺服器端遮罩：一代全顯、二三代遮罩）。 */
export interface NetworkNode {
  userId: string;
  name: string;
  generation: number;
  status: NetworkNodeStatus;
  daysToExpiry: number | null;
  endDate: string | null;
  joinedAt: string;
  listingId: string | null;
  childCount: number;
  /** 自身與可見子樹（封頂 3 代）最新加入時間——「更新順序」的排序鍵 */
  subtreeLatestJoinedAt: string;
}

export interface NetworkAttention {
  total: number;            // 全部需要關注的人數（items 有伺服器上限）
  items: NetworkNode[];
}

export interface NetworkSummary {
  firstGenCount: number;
  secondGenCount: number;
  thirdGenCount: number;
  totalReferrals: number;
}

export interface NetworkOverview {
  userReferralCode: string;
  sort: NetworkSortMode;
  roots: NetworkNode[];     // 一代（排序後；下線走懶載入）
  attention: NetworkAttention;
  summary: NetworkSummary;
}

export interface NetworkSearchMatch {
  node: NetworkNode;                 // 顯示名已遮罩（比對用真名在伺服器）
  ancestorPath: string[];            // 一代 → 命中者本身
}

const SORT_MODES: readonly NetworkSortMode[] = ['updated_desc', 'updated_asc', 'name_asc', 'name_desc'];

/** 排序選項（文案經需求方核定，測試釘死一字不差）。 */
export const SORT_OPTIONS: { value: NetworkSortMode; label: string }[] = [
  { value: 'updated_desc', label: '更新：新 → 舊' },
  { value: 'updated_asc', label: '更新：舊 → 新' },
  { value: 'name_asc', label: '姓名：A → Z（筆畫少 → 多）' },
  { value: 'name_desc', label: '姓名：Z → A（筆畫多 → 少）' },
];

/**
 * 排序晶片的收合短標籤（≤3 字）：窄螢幕上完整文案會撐爆整列、把高頻的
 * 搜尋框壓扁——收合只顯示狀態、完整文案留在展開的選單裡。
 */
export const SORT_SHORT_LABEL: Record<NetworkSortMode, string> = {
  updated_desc: '最新',
  updated_asc: '最舊',
  name_asc: 'A→Z',
  name_desc: 'Z→A',
};

/** 非法/未知值一律回落預設 updated_desc（與伺服器 parseSortMode 同語意）。 */
export function parseSortMode(raw: unknown): NetworkSortMode {
  return (SORT_MODES as readonly unknown[]).includes(raw) ? (raw as NetworkSortMode) : 'updated_desc';
}

export const SORT_STORAGE_KEY = 'referralSortMode';

/** 讀取上次選的排序；沒存過或被塞壞值都安全回落預設。 */
export function readStoredSort(): NetworkSortMode {
  try {
    return parseSortMode(localStorage.getItem(SORT_STORAGE_KEY));
  } catch {
    return 'updated_desc';
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
export function nodeDaysLeft(node: { endDate: string | null; daysToExpiry: number | null }): number | null {
  if (node.endDate) {
    const ms = Date.parse(node.endDate);
    if (!Number.isNaN(ms)) return Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000));
  }
  return node.daysToExpiry;
}
