import { WITHDRAWAL_FEE } from './withdrawalValidation';
import type { RewardHistoryRecord } from '@contract';

/** 該筆明細是否為推薦獎勵（付款或任務續約）。決定是否顯示代數與名字快照。 */
export function isReferralSource(cat: RewardHistoryRecord['sourceCategory']): boolean {
  return cat === 'referral_payment' || cat === 'referral_task_renewal';
}

/**
 * 明細第二行（細節）的顯示字串。純函式，便於單元測試。
 *
 * - 提領：以結構化金額組出「提領 X P + 手續費 15 P」——principal = |amount| − fee，
 *   手續費取自 withdrawalValidation 的固定常數；不照抄後端 description。
 * - 推薦類（付款／任務續約）：用名字快照（後端已依世代深度遮罩，見 mask.ts）；
 *   第 2/3 代帶括號上線「被推薦人（其上線）」。
 * - 其餘（退款／人工調整）：description 原樣（乾淨人話句子）；無則回退「—」。
 */
export function formatRewardDetail(record: RewardHistoryRecord): string {
  if (record.sourceCategory === 'withdrawal') {
    const principal = Math.abs(record.amount) - WITHDRAWAL_FEE;
    return `提領 ${principal} P + 手續費 ${WITHDRAWAL_FEE} P`;
  }
  if (isReferralSource(record.sourceCategory) && record.refereeName) {
    return record.generation && record.generation > 1 && record.refereeReferrerName
      ? `${record.refereeName}（${record.refereeReferrerName}）`
      : record.refereeName;
  }
  return record.description || '—';
}
