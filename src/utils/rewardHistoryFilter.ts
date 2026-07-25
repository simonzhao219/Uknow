import type { RewardSourceCategory } from '@contract';

/**
 * 獎勵明細「來源篩選」的資料模型（純資料＋純函式，元件只負責畫）。
 *
 * 為什麼從「5 顆平列 chip」改成「兩層」：
 *   - 版面：這張卡在桌面是 `lg:grid-cols-2` 的半欄（約 520–570px），手機更窄；
 *     5 顆含「推薦獎勵·任務續約」這種 8 字標籤的 chip，桌面折 2 列、手機折 3 列，
 *     篩選器比它篩的清單還高，且每列殘留寬度不同、鋸齒狀。
 *   - 語意：5 個分類其實是 2 群 ——「推薦獎勵（進帳）」與「點數提領（出帳）」，
 *     使用者第一層想的是「我賺了多少 / 我領了多少」，付款 vs 任務續約是次要細分。
 *   第一層只留 3 個 4 字內的短標籤（全部／推薦獎勵／點數提領），任何寬度都是一列；
 *   細分在選了群組後才出現（漸進式揭露），且因父層已給脈絡，子標籤只留差異詞
 *   （付款／任務續約／提領／退款），2–4 字。
 *
 * 代價：不再支援跨群多選（例如同時看「付款 + 提領」）。收支混看等同「全部」，
 * 而混選兩個不同群的細分是罕見需求，用清楚的單選換掉三列鋸齒版面划算。
 */

/**
 * 明細列 badge 用的完整標籤（文字的單一真相）。
 * 這裡刻意保留長名：在「全部」檢視下，單看一列也要能懂它是哪種來源。
 * 篩選器不用這組標籤——見下方 group.label / sub.label 的短標籤。
 */
export const REWARD_SOURCE_LABELS: Record<RewardSourceCategory, string> = {
  referral_payment: '推薦獎勵·付款',
  referral_task_renewal: '推薦獎勵·任務續約',
  withdrawal: '點數提領',
  withdrawal_refund: '提領退款',
  adjustment_manual: '人工調整',
};

export type RewardFilterGroupId = 'referral' | 'withdrawal';

export interface RewardFilterSubOption {
  source: RewardSourceCategory;
  /** 第二層短標籤：父層已給脈絡，只留差異詞。 */
  label: string;
}

export interface RewardFilterGroup {
  id: RewardFilterGroupId;
  /** 第一層短標籤：4 字內，三段控制項在 320px 寬也放得下同一列。 */
  label: string;
  subs: readonly RewardFilterSubOption[];
}

/**
 * 可篩選的來源群組。
 * 刻意不含 adjustment_manual——目前無端點產生，列出來會是永遠空的分類。
 */
export const REWARD_FILTER_GROUPS: readonly RewardFilterGroup[] = [
  {
    id: 'referral',
    label: '推薦獎勵',
    subs: [
      { source: 'referral_payment', label: '付款' },
      { source: 'referral_task_renewal', label: '任務續約' },
    ],
  },
  {
    id: 'withdrawal',
    label: '點數提領',
    subs: [
      { source: 'withdrawal', label: '提領' },
      { source: 'withdrawal_refund', label: '退款' },
    ],
  },
];

export interface RewardHistoryFilter {
  /** null = 全部（不帶 ?source=） */
  group: RewardFilterGroupId | null;
  /** null = 該群組不限（帶整群的 CSV） */
  source: RewardSourceCategory | null;
}

export const ALL_REWARD_FILTER: RewardHistoryFilter = { group: null, source: null };

export function findRewardFilterGroup(id: RewardFilterGroupId | null): RewardFilterGroup | null {
  return REWARD_FILTER_GROUPS.find((g) => g.id === id) ?? null;
}

/**
 * 選取狀態 → 後端 `?source=` 的值（CSV）。
 * 回傳 '' 代表不帶 param＝全部；群組不限時帶整群 CSV，讓篩選與 count 都在 DB 端算
 * （見 supabase/functions/api/index.ts 的 /rewards/history）。
 */
export function toRewardSourceParam(filter: RewardHistoryFilter): string {
  if (!filter.group) return '';
  if (filter.source) return filter.source;
  const group = findRewardFilterGroup(filter.group);
  return group ? group.subs.map((s) => s.source).join(',') : '';
}

/** 是否處於篩選中（決定逐列餘額是否顯示、空狀態文案用哪句）。 */
export function isRewardFilterActive(filter: RewardHistoryFilter): boolean {
  return filter.group !== null;
}

/** 目前篩選的顯示名稱（空狀態文案用）；全部時回 null。 */
export function rewardFilterLabel(filter: RewardHistoryFilter): string | null {
  if (!filter.group) return null;
  if (filter.source) return REWARD_SOURCE_LABELS[filter.source];
  return findRewardFilterGroup(filter.group)?.label ?? null;
}

/**
 * 切換第一層群組：換群組時一律清掉細分（避免「推薦獎勵 + 提領退款」這種
 * 父子矛盾的殘留狀態）。
 */
export function selectRewardFilterGroup(group: RewardFilterGroupId | null): RewardHistoryFilter {
  return { group, source: null };
}
