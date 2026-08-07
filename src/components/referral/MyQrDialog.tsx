import { useEffect, useState } from 'react';
import { QrCode, Share2, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { MemberVerifyQrTab } from './MemberVerifyQrTab';
import { InviteFriendPanelContent } from './InviteFriendPanelContent';
import {
  type MyQrTab,
  readMyQrTab,
  resolveMyQrTab,
  writeMyQrTab,
} from '../../utils/myQrTabPreference';

interface MyQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 是否已加入推薦計畫（未加入時整個「邀請好友」分頁都不存在）。 */
  joined: boolean;
  referralCode?: string | null;
  memberName?: string | null;
  accountStatus?: 'active' | 'expired';
}

/**
 * 會員中心／推薦管理的「我的 QR」面板。
 *
 * 分頁規則：
 *   - **已加入推薦計畫**：兩個分頁，「邀請好友」在左且為預設——分享是主動、頻繁的
 *     動作，驗證碼多半是店家開口時才臨時要用。使用者切換過就記住（localStorage），
 *     下次直接停在他慣用的那頁。
 *   - **未加入推薦計畫**：只有「會員驗證碼」，連分頁列都不顯示（只有一個分頁時
 *     頁籤沒有意義）。加入推薦計畫的入口在推薦碼欄位的 CTA（見 MyQrEntry），
 *     所以這裡藏掉邀請分頁不會讓使用者找不到加入的路。
 *
 * **唯一引用者是 MyQrEntry**——所有狀態（joined／碼／會籍）都由它掌握，這裡只呈現。
 */
export function MyQrDialog({
  open,
  onOpenChange,
  joined,
  referralCode,
  memberName,
  accountStatus,
}: MyQrDialogProps) {
  const canShareInvite = joined && !!referralCode;
  const [tab, setTab] = useState<MyQrTab>(() => resolveMyQrTab(canShareInvite, readMyQrTab()));

  // 每次開啟都重新決定停在哪一頁：偏好可能在上次開啟時被改過，而 canShareInvite
  // 也可能在這期間變了（剛加入推薦計畫）。
  useEffect(() => {
    if (open) setTab(resolveMyQrTab(canShareInvite, readMyQrTab()));
  }, [open, canShareInvite]);

  const handleTabChange = (value: string) => {
    const next: MyQrTab = value === 'verify' ? 'verify' : 'invite';
    setTab(next);
    // 只記使用者「主動切換」的結果；未加入時的強制 verify 不該污染偏好，
    // 否則他加入之後第一次開啟會莫名其妙停在驗證碼。
    if (canShareInvite) writeMyQrTab(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 刻意不給 DialogDescription：分頁名稱（邀請好友／會員驗證碼）已經說明了
          用途，驗證頁自己還有一句「出示這組碼給店家掃描」，標題下再放一句總述
          是把同一件事講第二遍，還把 QR 擠出手機的第一屏。aria-describedby 顯式
          給 undefined 是 Radix 的要求——不給的話它會在 dev console 警告缺說明。 */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            我的 QR
          </DialogTitle>
        </DialogHeader>

        {canShareInvite ? (
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invite" className="gap-1" data-testid="invite-tab">
                <Share2 className="h-4 w-4" />
                邀請好友
              </TabsTrigger>
              <TabsTrigger value="verify" className="gap-1" data-testid="verify-tab">
                <Shield className="h-4 w-4" />
                會員驗證碼
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invite" className="pt-4">
              <InviteFriendPanelContent referralCode={referralCode} memberName={memberName} />
            </TabsContent>

            <TabsContent value="verify" className="pt-4">
              <MemberVerifyQrTab active={open && tab === 'verify'} accountStatus={accountStatus} />
            </TabsContent>
          </Tabs>
        ) : (
          // 未加入推薦計畫：只有驗證碼，不顯示分頁列（單一分頁的頁籤沒有意義）。
          <div className="pt-2">
            <MemberVerifyQrTab active={open} accountStatus={accountStatus} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
