import { useContext, useEffect, useRef, useState } from 'react';
import { Share2, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { UserContext } from '../../App';
import { useNotification } from '../notifications/NotificationContext';
import { JoinReferralProgramDialog } from './JoinReferralProgramDialog';
import { myQrTabsForUser } from '../../utils/myQrTabPreference';
import { shareReferralInvite } from '../../utils/referralInvite';

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
 * - 已加入推薦計畫：次要鈕「邀請好友」，按下走 shareReferralInvite（與我的 QR 頁同一支）：
 *   先系統分享面板讓使用者自己選 App，用不了時交給所在 App（LINE 好友選擇器），最後複製。
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
  const inviteRef = useRef<HTMLButtonElement>(null);
  const justJoined = useRef(false);

  // 碼在付款成功時就已產生（process_successful_payment），但「加入推薦計畫」才是
  // 簽了參加契約書的憑據——沒加入就不該拿碼去邀請人。
  const canInvite = myQrTabsForUser(user).invite;

  // 簽完之後加入鈕整顆換成邀請好友（不同的樹、必定重掛），焦點會掉到 body——
  // 交給同一位置的新鈕，鍵盤與讀屏使用者接著就能邀請（§9）。
  useEffect(() => {
    if (canInvite && justJoined.current) {
      justJoined.current = false;
      inviteRef.current?.focus();
    }
  }, [canInvite]);

  const handleJoinSuccess = async () => {
    setJoinOpen(false);
    justJoined.current = true;
    // 重抓 /profile 取代手刻的 setUser + localStorage——加入成功會同時改動
    // referralProgramJoined / referralCode / referralSignatureUrl，逐欄補寫遲早漏。
    const profile = await refreshUser();
    // 重抓失敗（回 null、不 reject）時鈕暫時不翻；收掉旗標，免得之後別處讓它翻轉時搶焦點。
    if (!profile) justJoined.current = false;
    onJoined?.();
  };

  if (canInvite) {
    return (
      <Button
        ref={inviteRef}
        tone="secondary"
        size="sm"
        className={className}
        onClick={() => shareReferralInvite(user.referralCode, showToast, user.name)}
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
        {/* 手機隱藏圖示：會員中心 2×2 小卡在 360px 只剩約 122px，「加入推薦計畫」六字＋圖示
            ＋內距要 126px（375px 只餘約 4px）。品牌色本身已是辨識，圖示讓位。 */}
        <Shield className="h-4 w-4 max-sm:hidden" aria-hidden="true" />
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
