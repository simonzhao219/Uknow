// 會員中心狀態總覽的純計算——從既有 API 回應推出卡片與「需要注意」區要顯示的
// 數字。全部是前端推導，不新增後端欄位（業主 2026-10-03 裁決）。
// 型別取自契約（status 是字面量聯集），拼錯狀態名 tsc 會擋。

import type { WithdrawalRecord } from '@contract';
import type { NetworkAttention } from '../../utils/referralNetwork';

/**
 * 一代即將到期的人數（業主裁決：會員中心只統計即將到期，已失效／停權不列）。
 * 後端 attention 只收一代即將到期，total 就是精確人數——items 最多 6 筆，不能拿來數。
 */
export function countExpiring(
  attention: Pick<NetworkAttention, 'total'> | null | undefined,
): number {
  return attention?.total ?? 0;
}

/** 待查收（已匯款、等會員確認收款）的提領筆數。 */
export function countAwaitingCollection(withdrawals: Pick<WithdrawalRecord, 'status'>[]): number {
  return withdrawals.filter((w) => w.status === 'awaiting_collection').length;
}
