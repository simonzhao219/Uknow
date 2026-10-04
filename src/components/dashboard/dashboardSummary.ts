// 會員中心狀態總覽的純計算——從既有 API 回應推出卡片與「需要注意」區要顯示的
// 數字。全部是前端推導，不新增後端欄位（業主 2026-10-03 裁決）。

/** 下線節點的最小形狀（/referrals/network/overview 的 attention.items）。 */
interface AttentionNodeLike {
  status: string;
}

export interface ExpiringCount {
  count: number;
  /**
   * 後端 attention.items 依緊急度排序、即將到期排最前、最多 6 筆，但 total 也算
   * 已失效與停權。items 全是即將到期且 total 比 items 多時，被截掉的那些可能還有
   * 即將到期的人——此時只知道「至少 count 位」。
   */
  atLeast: boolean;
}

/** 即將到期的下線人數（業主裁決：會員中心只統計即將到期，已失效／停權不列）。 */
export function countExpiring(
  attention: { total: number; items: AttentionNodeLike[] } | null | undefined,
): ExpiringCount {
  if (!attention) return { count: 0, atLeast: false };
  const count = attention.items.filter((n) => n.status === 'expiring').length;
  const atLeast =
    count > 0 && count === attention.items.length && attention.total > attention.items.length;
  return { count, atLeast };
}

/** 「3」或「至少 6」——數字後面接量詞由呼叫端決定。 */
export function formatExpiringCount({ count, atLeast }: ExpiringCount): string {
  return atLeast ? `至少 ${count}` : `${count}`;
}

/** 待查收（已匯款、等會員確認收款）的提領筆數。 */
export function countAwaitingCollection(withdrawals: { status: string }[]): number {
  return withdrawals.filter((w) => w.status === 'awaiting_collection').length;
}

export type PrimaryAction = 'withdraw' | 'create-listing' | null;

/**
 * 整頁至多一顆黑色主按鈕（ui-ux-guidelines §13）。「申請提領」與「立即刊登」
 * 同時成立時提領優先（業主裁決 2026-10-04），刊登降為 brand 次行動。
 */
export function pickPrimaryAction({
  canWithdraw,
  hasNoListing,
}: {
  canWithdraw: boolean;
  hasNoListing: boolean;
}): PrimaryAction {
  if (canWithdraw) return 'withdraw';
  if (hasNoListing) return 'create-listing';
  return null;
}
