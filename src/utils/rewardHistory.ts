import { WITHDRAWAL_FEE } from './withdrawalValidation';
import type { RewardHistoryRecord } from '@contract';

/** 該筆明細是否為推薦獎勵（推薦新人或子代續約）。決定是否顯示代數與名字快照。 */
export function isReferralSource(cat: RewardHistoryRecord['sourceCategory']): boolean {
  return cat === 'referral_signup' || cat === 'referral_renewal';
}

/** 續約獎勵的來源註記：下線用免費續約券換的才標，付款續約不標（無須贅字）。 */
const FREE_RENEWAL_NOTE = '任務免費續約';

/**
 * 明細第二行（細節）的顯示字串。純函式，便於單元測試。
 *
 * - 提領：以結構化金額組出「提領 X P + 手續費 15 P」——principal = |amount| − fee，
 *   手續費取自 withdrawalValidation 的固定常數；不照抄後端 description。
 * - 推薦類（推薦新人／子代續約）：用名字快照（後端已依世代深度遮罩，見 mask.ts）；
 *   第 2/3 代帶括號上線「被推薦人（其上線）」。續約若是下線用推薦王免費續約券
 *   換的（viaFreeRenewal），補上「・任務免費續約」——分類軸改成拉新／續約後，
 *   付款續約與免費續約同屬一類，這行是它們唯一的區別（見 migration 0725 0002）。
 * - 其餘（退還／人工調整）：description 原樣（乾淨人話句子）；無則回退「—」。
 */
export function formatRewardDetail(record: RewardHistoryRecord): string {
  if (record.sourceCategory === 'withdrawal') {
    const principal = Math.abs(record.amount) - WITHDRAWAL_FEE;
    return `提領 ${principal} P + 手續費 ${WITHDRAWAL_FEE} P`;
  }
  if (isReferralSource(record.sourceCategory) && record.refereeName) {
    const who =
      record.generation && record.generation > 1 && record.refereeReferrerName
        ? `${record.refereeName}（${record.refereeReferrerName}）`
        : record.refereeName;
    return record.viaFreeRenewal ? `${who}・${FREE_RENEWAL_NOTE}` : who;
  }
  return record.description || '—';
}
