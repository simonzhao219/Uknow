import { useState } from 'react';
import { Share2, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { InviteFriendDialog } from './InviteFriendDialog';
import { JoinReferralProgramDialog } from './JoinReferralProgramDialog';

interface InviteFriendButtonProps {
  /** 是否已加入推薦計畫（gating 的單一事實）。 */
  joined: boolean;
  referralCode?: string | null;
  memberName?: string | null;
  /** 未加入者按下 → 走 JoinReferralProgramDialog，成功後回呼（更新會員狀態／重抓資料）。 */
  onJoinSuccess: (referralCode: string, joinedAt: string) => void;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * 單一「邀請好友」入口——會員中心與推薦管理兩處共用同一顆，行為一致：
 *   - 已加入且有推薦碼 → 開 InviteFriendDialog（QR/碼/連結/下載/分享）。
 *   - 未加入 → 開 JoinReferralProgramDialog 引導加入（取代舊有各自為政的死路/引導）。
 * gating 收斂在這裡，兩處入口不再各寫一份。
 */
export function InviteFriendButton({
  joined,
  referralCode,
  memberName,
  onJoinSuccess,
  className,
  size = 'sm',
}: InviteFriendButtonProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const canShare = joined && !!referralCode;

  return (
    <>
      <Button
        size={size}
        variant={canShare ? 'outline' : 'default'}
        className={cn(
          'shrink-0',
          canShare ? '' : 'bg-purple-600 hover:bg-purple-700 text-white',
          className,
        )}
        onClick={() => (canShare ? setShareOpen(true) : setJoinOpen(true))}
        title={canShare ? '分享邀請連結與 QR Code' : '加入推薦計畫'}
        data-testid="invite-friend-button"
      >
        {canShare ? (
          <>
            <Share2 className="mr-1 h-4 w-4" />
            邀請好友
          </>
        ) : (
          <>
            <Shield className="mr-1 h-4 w-4" />
            加入推薦計畫
          </>
        )}
      </Button>

      <InviteFriendDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        referralCode={referralCode}
        memberName={memberName}
      />

      <JoinReferralProgramDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onSuccess={(code, joinedAt) => {
          setJoinOpen(false);
          onJoinSuccess(code, joinedAt);
        }}
      />
    </>
  );
}
