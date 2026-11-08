// 後台推薦樹查帳的純函式（第 6 波 S3a 階段 6）：分頁合併、pinned 計數、結果與異常文案、
// 自動展開路徑。元件只負責呈現，判斷都在這裡，讓 vitest node 環境能逐情境釘住。
//
// 用語（W5-53、ui-ux §12.13）：樹上「第 N 層」、付款查帳收獎「第 1／2／3 代」、
// 推薦人鏈「推薦人／往上第 N 位」；不用「上線／下線」。
import type {
  AdminReferralAnomalyKind,
  AdminReferralGeneration,
  AdminReferralNode,
} from '@admin-referral-contract';

export type Tone = 'neutral' | 'muted' | 'warning';
export interface Label {
  text: string;
  tone: Tone;
}

/**
 * 一層（頂層、某人的子層、無法接上推薦樹的群組）的已載入狀態。
 * pinned（自動展開時「確保包含」的目標）接在尾端、不計入已顯示數、不影響 offset；
 * 使用者離開該層前一直留著。之後正常頁載到同一個 id 時不重複渲染，但計入已顯示數
 * ——它已經載入，而且畫面上看得到（以 pinned 的身分），所以 X / Y 不會跳號也不會重複。
 */
export interface LayerState {
  items: AdminReferralNode[];
  total: number;
  pinned: AdminReferralNode | null;
}

export type ExpandStep =
  | { kind: 'top'; ensureId: string }
  | { kind: 'children'; parentId: string; ensureId: string }
  | { kind: 'unplaceable'; ensureId: string };

export const emptyLayer = (): LayerState => ({ items: [], total: 0, pinned: null });

export function appendPage(
  state: LayerState,
  page: { nodes: AdminReferralNode[]; total: number; pinned: AdminReferralNode | null },
): LayerState {
  const seen = new Set(state.items.map((n) => n.id));
  const items = [...state.items];
  for (const n of page.nodes) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      items.push(n);
    }
  }
  return { items, total: page.total, pinned: state.pinned ?? page.pinned };
}

export function rowsToRender(state: LayerState): { node: AdminReferralNode; pinned: boolean }[] {
  const pinnedId = state.pinned?.id;
  const rows = state.items
    .filter((n) => n.id !== pinnedId)
    .map((node) => ({ node, pinned: false }));
  if (state.pinned) rows.push({ node: state.pinned, pinned: true });
  return rows;
}

/** 「已顯示 X / Y」的 X：只數正常分頁載入的列（含與 pinned 同一人者）。 */
export function shownCount(state: LayerState): number {
  return state.items.length;
}

const RESULT_TEXT: Record<AdminReferralGeneration['result'], Label> = {
  paid: { text: '已發', tone: 'neutral' },
  not_applicable: { text: '不適用', tone: 'neutral' },
  missing: { text: '缺漏', tone: 'warning' },
  recipient_mismatch: { text: '收獎人不符', tone: 'warning' },
  cycle_stopped: { text: '成環停發', tone: 'warning' },
  undeterminable: { text: '無法判定', tone: 'muted' },
};

const REASON_TEXT: Record<NonNullable<AdminReferralGeneration['reason']>, string> = {
  changed_after: '付款後推薦關係有變動',
  no_subscription: '找不到對應訂閱',
  referrer_mismatch: '推薦人資料兩處不一致',
};

export function resultLabel(
  result: AdminReferralGeneration['result'],
  reason: AdminReferralGeneration['reason'],
): Label {
  const base = RESULT_TEXT[result];
  if (result === 'undeterminable' && reason) {
    return { ...base, text: `${base.text}：${REASON_TEXT[reason]}` };
  }
  return base;
}

const ANOMALY_TEXT: Record<AdminReferralAnomalyKind, string> = {
  cycle: '推薦關係成環',
  self_referral: '自己推薦自己',
  missing_reward: '獎金缺漏',
  recipient_mismatch: '收獎人不符',
  ledger_mismatch: '點數跨表核對不符',
};

export function anomalyLabel(kind: AdminReferralAnomalyKind): string {
  return ANOMALY_TEXT[kind];
}

/** 節點上的異常徽章：兩種以內逐一列出，超過收成一顆「N 項異常」。 */
export function nodeAnomalyBadges(kinds: AdminReferralAnomalyKind[]): string[] {
  if (kinds.length > 2) return [`${kinds.length} 項異常`];
  return kinds.map(anomalyLabel);
}

export function layerLabel(layer: number | null): string {
  return layer === null ? '層級無法判定' : `第 ${layer} 層`;
}

export function unplaceableReasonText(reason: 'cycle' | 'truncated'): string {
  return reason === 'cycle' ? '推薦關係成環，無法在樹上定位' : '往上超過 50 層，無法在樹上定位';
}

/** 推薦人鏈（由近到遠）第 index 位的稱呼。 */
export function uplineLabel(index: number): string {
  return index === 0 ? '推薦人' : `往上第 ${index + 1} 位`;
}

/** 姓名為空時不退回 Email（個資最小化），寫「未填姓名」。 */
export function displayName(name: string): string {
  return name.trim() ? name : '未填姓名';
}

/**
 * 帳號狀態說明（W6-15）：停權、未加入推薦計畫、會籍失效照發獎金，只是不能提領。
 * 原因依規格書 §10.1 提領守衛順序取第一個命中的：suspended → not_joined →
 * subscription_invalid。
 */
export function withdrawalBlockReason(node: AdminReferralNode): string | null {
  const reason =
    node.status === 'suspended'
      ? '帳號已停權'
      : !node.referralProgramJoined
        ? '尚未加入推薦計畫'
        : node.status === 'expired'
          ? '會籍已失效'
          : null;
  return reason ? `獎金照常入帳，但目前不可提領（${reason}）` : null;
}

/**
 * 點搜尋命中（或從會員詳情跳來）時的展開步驟：由頂層往下，每層確保包含下一層的人。
 * 在環上的人改走「無法接上推薦樹的會員」群組（W6-21）；往上超過 50 層回 null（只開詳情）。
 */
export function expansionPath(
  targetId: string,
  ancestorIds: string[] | null,
  unplaceableReason: 'cycle' | 'truncated' | null,
): ExpandStep[] | null {
  if (ancestorIds === null) {
    return unplaceableReason === 'cycle' ? [{ kind: 'unplaceable', ensureId: targetId }] : null;
  }
  const chain = [...ancestorIds, targetId];
  const steps: ExpandStep[] = [{ kind: 'top', ensureId: chain[0] }];
  for (let i = 1; i < chain.length; i++) {
    steps.push({ kind: 'children', parentId: chain[i - 1], ensureId: chain[i] });
  }
  return steps;
}
