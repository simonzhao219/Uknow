import { useContext } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { UserContext } from '../../App';
import { myQrTabsForUser } from '../../utils/myQrTabPreference';
import { useCopyToast } from '../../hooks/useCopyToast';

interface ReferralCodeWithCopyProps {
  /**
   * field：「我的推薦碼」標籤＋碼（會員資訊卡、推薦管理推薦碼列）；
   * centered：只有碼、置中（我的 QR 頁，碼就在 QR 下方，標籤多餘）。
   */
  layout?: 'field' | 'centered';
}

/**
 * 「推薦碼＋複製」——會員資訊卡、推薦管理推薦碼列、我的 QR 頁都放這一顆（推薦入口
 * 三顆共用元件之一）。碼與閘門由元件自己從 UserContext 取（myQrTabsForUser），
 * 呼叫端沒有傳錯碼、漏掉閘門的機會。
 *
 * 未加入推薦計畫時不露出碼（碼在付款成功時就已產生，但沒簽參加契約書之前不該
 * 拿出來用）：field 版留著標籤並寫「尚未加入推薦計畫」——加入鈕只在 InviteFriendButton，
 * 這裡不放第二顆；centered 版整塊不渲染。
 */
export function ReferralCodeWithCopy({ layout = 'field' }: ReferralCodeWithCopyProps) {
  const { user } = useContext(UserContext);
  const copy = useCopyToast();
  const canShowCode = myQrTabsForUser(user).invite;
  const centered = layout === 'centered';

  if (!canShowCode && centered) return null;

  return (
    <div className="min-w-0">
      {centered ? null : <p className="text-sm text-muted-foreground">我的推薦碼</p>}
      {canShowCode ? (
        <div className={cn('flex min-w-0 items-center gap-1', centered && 'justify-center')}>
          <span
            data-testid="my-referral-code"
            className="truncate font-mono text-lg font-semibold tracking-wider text-foreground"
          >
            {user.referralCode}
          </span>
          {/* icon-only：碼就在左邊，文字標籤多餘；可存取名稱靠 aria-label。
              size="icon" 在觸控裝置是 44px 見方（§1）。 */}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => copy(user.referralCode, '推薦碼已複製！')}
            aria-label="複製推薦碼"
            title="複製推薦碼"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <p className="font-medium text-muted-foreground">尚未加入推薦計畫</p>
      )}
    </div>
  );
}
