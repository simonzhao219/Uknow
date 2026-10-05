// 會員中心狀態總覽的純計算——從既有 API 回應推出卡片與「需要注意」區要顯示的
// 數字。全部是前端推導，不新增後端欄位（業主 2026-10-03 裁決）。
// 型別取自契約（status 是字面量聯集），拼錯狀態名 tsc 會擋。

import type { WithdrawalRecord } from '@contract';
import type { NetworkAttention, NetworkNodeStatus } from '../../utils/referralNetwork';

export interface ExpiringCount {
  count: number;
  /**
   * 後端 attention 只收一代即將到期（B1 起）：items 最多 6 筆、total 是精確人數。
   * 本函式仍只數 items，total 比 items 多時顯示「至少 count 位」。
   */
  atLeast: boolean;
}

/** 一代即將到期的人數（業主裁決：會員中心只統計即將到期，已失效／停權不列）。 */
export function countExpiring(
  attention:
    | (Pick<NetworkAttention, 'total'> & { items: { status: NetworkNodeStatus }[] })
    | null
    | undefined,
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
export function countAwaitingCollection(withdrawals: Pick<WithdrawalRecord, 'status'>[]): number {
  return withdrawals.filter((w) => w.status === 'awaiting_collection').length;
}
