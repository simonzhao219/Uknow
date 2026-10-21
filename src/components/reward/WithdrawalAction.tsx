import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import {
  MIN_REQUIRED_BALANCE,
  MIN_WITHDRAWAL,
  WITHDRAWAL_FEE,
  canRequestWithdrawal,
} from '../../utils/withdrawalValidation';

export interface WithdrawalActionProps {
  availableRewards: number;
  hasWithdrawnToday: boolean;
  /** useSubscription 的 status；只有明確 'expired' 才擋（尚未取得不當成失效）。 */
  subscriptionStatus?: string | null;
  /** 是否已加入推薦計畫。`undefined`＝會員資料還沒取得：不畫成「未加入」（總綱 §0 原則 1）。 */
  referralProgramJoined?: boolean;
  onStartWithdrawal: () => void;
}

/**
 * 「申請Point提領」鈕與它被停用時的原因，收在獎勵回饋「可提領」主區內（淡底容器，
 * 所以是 `secondary`／`container="brand"`，ui-ux-guidelines §12.11）。
 *
 * 判斷式與會員中心的「申請提領」共用 canRequestWithdrawal（只有現在能做的事才出現可按的
 * 鈕）；原因文案的優先序：未加入 → 失效 → 餘額不足 → 今日已提領。
 *
 * 「已付費、未加入推薦計畫」(P3′) 是正式狀態：這裡只用說明文字＋連結引導到推薦管理（那裡有
 * 加入推薦計畫的引導鈕），不複製鈕、不另寫分享閘門。會籍失效時橫幅已有續訂鈕，這裡不重複。
 */
export function WithdrawalAction({
  availableRewards,
  hasWithdrawnToday,
  subscriptionStatus,
  referralProgramJoined,
  onStartWithdrawal,
}: WithdrawalActionProps) {
  const canWithdraw = canRequestWithdrawal({
    availableRewards,
    hasWithdrawnToday,
    subscriptionStatus,
    referralProgramJoined,
  });
  const notJoined = referralProgramJoined === false;

  const disabledReason = () => {
    if (notJoined) return '尚未加入推薦計畫，無法申請提領';
    if (subscriptionStatus === 'expired') return '訂閱已失效，無法申請提領。請續訂以恢復服務。';
    if (availableRewards < MIN_REQUIRED_BALANCE) {
      return `可提領Point不足${MIN_REQUIRED_BALANCE.toLocaleString()}P（最低提領${MIN_WITHDRAWAL.toLocaleString()}P + 手續費${WITHDRAWAL_FEE}P）`;
    }
    if (hasWithdrawnToday) return '今日已提領過一次，請明天再試';
    return '';
  };
  const reason = canWithdraw ? '' : disabledReason();

  return (
    <div className="space-y-2">
      <Button
        tone="secondary"
        container="brand"
        size="lg"
        onClick={onStartWithdrawal}
        disabled={!canWithdraw}
        className="w-full"
      >
        申請Point提領
      </Button>
      {reason && <p className="text-center text-sm">{reason}</p>}
      {!canWithdraw && notJoined && (
        <p className="text-center text-sm">
          <Link to="/referrals" className="font-medium underline underline-offset-2">
            前往推薦管理加入
          </Link>
        </p>
      )}
    </div>
  );
}
