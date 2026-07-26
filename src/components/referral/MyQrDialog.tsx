import { useState } from 'react';
import { QrCode, Share2, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { MemberVerifyQrTab } from './MemberVerifyQrTab';
import { InviteFriendPanelContent } from './InviteFriendPanelContent';

interface MyQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 是否已加入推薦計畫（決定「邀請好友」分頁顯示面板或加入引導）。 */
  joined: boolean;
  referralCode?: string | null;
  memberName?: string | null;
  accountStatus?: 'active' | 'expired';
  /** 未加入者按下分頁內的加入引導 → 交還給 MyQrEntry 開流程，本元件不自己開窗。 */
  onRequestJoin: () => void;
}

/**
 * 會員中心「我的 QR」：一個入口、兩分頁。
 *   - 「會員核身碼」（預設）：出示給店家掃描核身的動態短效碼——即時性高、容錯低，故設為預設。
 *   - 「邀請好友」：現有推薦 QR（重用 InviteFriendPanelContent）；未加入推薦計畫時顯示
 *     可點擊的加入引導，不空白。
 * 兩者用途/受眾完全不同（一給店家掃核身、一給朋友掃註冊），故分頁圖示與文案明確區隔。
 *
 * **唯一引用者是 MyQrEntry**——所有狀態（joined／碼／會籍）與加入流程都由它掌握，
 * 這裡只負責呈現。加入流程刻意不放在本元件內：兩頁共用的加入入口有兩個（推薦碼
 * 欄位的 CTA 與這裡的分頁引導），開在同一處才不會有兩份 dialog 狀態各自為政。
 */
export function MyQrDialog({
  open,
  onOpenChange,
  joined,
  referralCode,
  memberName,
  accountStatus,
  onRequestJoin,
}: MyQrDialogProps) {
  const [tab, setTab] = useState<'verify' | 'invite'>('verify');
  const canShareInvite = joined && !!referralCode;

  return (
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
                {/* 「使用」不是「產生」——碼在付款成功時就已產生，加入推薦計畫
                    解鎖的是使用權（見 MyQrEntry 的 canShowCode 註解）。 */}
                <p className="text-sm text-muted-foreground">
                  加入推薦計畫後即可使用專屬邀請碼，邀請好友註冊。
                </p>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  size="sm"
                  onClick={onRequestJoin}
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
  );
}
