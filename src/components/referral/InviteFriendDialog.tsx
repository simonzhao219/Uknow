import { QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { InviteFriendPanelContent } from './InviteFriendPanelContent';

interface InviteFriendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referralCode?: string | null;
  memberName?: string | null;
}

/**
 * 邀請好友面板的「外殼」：單一 Dialog（沿用專案 LegalDialog/ui.dialog 慣例，手機本就
 * 近乎滿版，一套實作一套測試）。內容抽在 InviteFriendPanelContent，方便單測與換殼。
 *
 * max-h + overflow-y-auto：手機（含 LINE in-app 網址列吃高度）內容不溢出、可捲動。
 */
export function InviteFriendDialog({
  open,
  onOpenChange,
  referralCode,
  memberName,
}: InviteFriendDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            邀請好友
          </DialogTitle>
          <DialogDescription>每成功推薦一人可獲得推薦獎勵。</DialogDescription>
        </DialogHeader>
        <InviteFriendPanelContent referralCode={referralCode} memberName={memberName} />
      </DialogContent>
    </Dialog>
  );
}
