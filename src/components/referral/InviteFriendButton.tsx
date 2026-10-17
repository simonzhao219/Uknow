import { useContext, useState } from 'react';
import { Share2, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { UserContext } from '../../App';
import { useNotification } from '../notifications/NotificationContext';
import { JoinReferralProgramDialog } from './JoinReferralProgramDialog';
import { myQrTabsForUser } from '../../utils/myQrTabPreference';
import { buildInviteMessage, shareToLine } from '../../utils/referralInvite';

interface InviteFriendButtonProps {
  /** 外框與寬度依版面脈絡給（推薦格整寬、推薦碼列靠右）。 */
  className?: string;
  /** 加入成功後的額外副作用（推薦管理頁重抓網絡）。會員狀態同步已由本元件處理。 */
  onJoined?: () => void;
  /**
   * 同頁已有更優先的引導鈕（會員中心的續訂）時，「加入推薦計畫」讓位成次要外框——
   * 引導鈕一頁一顆，優先序續訂＞加入推薦計畫＞確認收款（ui-ux-guidelines §12.11）。
   * 只改按鈕的視覺權重，不改顯示條件與行為。
   */
  yieldsGuide?: boolean;
}

/**
 * 「邀請好友／加入推薦計畫」同一個位置——會員中心推薦格與推薦管理推薦碼列都放這一顆
 * （推薦入口三顆共用元件之一）。
 *
 * - 已加入推薦計畫：次要鈕「邀請好友」，按下走 shareToLine——手機與 LINE 內直接開
 *   LINE 好友選擇器，桌機退回系統分享面板或複製。
 * - 未加入（首購者付完款都是）：同一位置是「加入推薦計畫」引導鈕，簽完 refreshUser
 *   之後閘門翻過來，鈕立刻變成「邀請好友」。
 *
 * 刻意不開任何行為 prop（同已退場的 MyQrEntry）：是否已加入、推薦碼都由元件自己從
 * UserContext（`/profile`）取，閘門吃 myQrTabsForUser——3967f69 的事故是同一條規則
 * 被複製成兩份、只改了一邊。className 只影響外框、onJoined 只是副作用掛鉤、
 * yieldsGuide 只降視覺權重，三者都無法造成兩處行為分歧。
 */
export function InviteFriendButton({
  className,
  onJoined,
  yieldsGuide = false,
}: InviteFriendButtonProps) {
  const { user, refreshUser } = useContext(UserContext);
  const { showToast } = useNotification();
  const [joinOpen, setJoinOpen] = useState(false);

  // 碼在付款成功時就已產生（process_successful_payment），但「加入推薦計畫」才是
  // 簽了參加契約書的憑據——沒加入就不該拿碼去邀請人。
  const canInvite = myQrTabsForUser(user).invite;

  const handleJoinSuccess = async () => {
    setJoinOpen(false);
    // 重抓 /profile 取代手刻的 setUser + localStorage——加入成功會同時改動
    // referralProgramJoined / referralCode / referralSignatureUrl，逐欄補寫遲早漏。
    await refreshUser();
    onJoined?.();
  };

  if (canInvite) {
    return (
      <Button
        tone="secondary"
        size="sm"
        className={className}
        onClick={() => shareToLine(buildInviteMessage(user.referralCode), showToast)}
        data-testid="invite-friend-button"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        邀請好友
      </Button>
    );
  }

  return (
    <>
      <Button
        tone={yieldsGuide ? 'secondary' : 'guide'}
        size="sm"
        className={className}
        onClick={() => setJoinOpen(true)}
        data-testid="join-referral-button"
      >
        <Shield className="h-4 w-4" aria-hidden="true" />
        加入推薦計畫
      </Button>
      <JoinReferralProgramDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onSuccess={handleJoinSuccess}
      />
    </>
  );
}
