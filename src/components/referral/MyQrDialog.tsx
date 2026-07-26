import { useState } from 'react';
import { QrCode, Share2, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { MemberVerifyQrTab } from './MemberVerifyQrTab';
import { InviteFriendPanelContent } from './InviteFriendPanelContent';
import { JoinReferralProgramDialog } from './JoinReferralProgramDialog';

interface MyQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 是否已加入推薦計畫（決定「邀請好友」分頁顯示面板或加入引導）。 */
  joined: boolean;
  referralCode?: string | null;
  memberName?: string | null;
  accountStatus?: 'active' | 'expired';
  onJoinSuccess: (referralCode: string, joinedAt: string) => void;
}

/**
 * 會員中心「我的 QR」：一個入口、兩分頁。
 *   - 「會員核身碼」（預設）：出示給店家掃描核身的動態短效碼——即時性高、容錯低，故設為預設。
 *   - 「邀請好友」：現有推薦 QR（重用 InviteFriendPanelContent）；未加入推薦計畫時顯示
 *     可點擊的加入引導（重用 JoinReferralProgramDialog），不空白。
 * 兩者用途/受眾完全不同（一給店家掃核身、一給朋友掃註冊），故分頁圖示與文案明確區隔。
 */
export function MyQrDialog({
  open,
  onOpenChange,
  joined,
  referralCode,
  memberName,
  accountStatus,
  onJoinSuccess,
}: MyQrDialogProps) {
  const [tab, setTab] = useState<'verify' | 'invite'>('verify');
  const [joinOpen, setJoinOpen] = useState(false);
  const canShareInvite = joined && !!referralCode;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              我的 QR
            </DialogTitle>
            <DialogDescription>
              核身碼給店家掃描確認身分；邀請碼給朋友掃描直接註冊。
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'verify' | 'invite')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="verify" className="gap-1" data-testid="verify-tab">
                <Shield className="h-4 w-4" />
                會員核身碼
              </TabsTrigger>
              <TabsTrigger value="invite" className="gap-1" data-testid="invite-tab">
                <Share2 className="h-4 w-4" />
                邀請好友
              </TabsTrigger>
            </TabsList>

            <TabsContent value="verify" className="pt-4">
              <MemberVerifyQrTab active={open && tab === 'verify'} accountStatus={accountStatus} />
            </TabsContent>

            <TabsContent value="invite" className="pt-4">
              {canShareInvite ? (
                <InviteFriendPanelContent referralCode={referralCode} memberName={memberName} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    加入推薦計畫後即可產生專屬邀請碼，邀請好友註冊。
                  </p>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    size="sm"
                    onClick={() => setJoinOpen(true)}
                  >
                    <Shield className="mr-1 h-4 w-4" />
                    加入推薦計畫
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
