import { useContext } from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { UserContext } from '../../App';

interface MyQrEntryProps {
  /** 外框樣式依版面脈絡給。狀態與行為一律由本元件決定——刻意不開任何行為 prop。 */
  className?: string;
  /** 加入成功後的額外副作用（推薦管理頁重抓網絡）。會員狀態同步已由本元件處理。 */
  onJoined?: () => void;
}

/** 施工中的 stub：介面已定、閘門未實作（TDD 紅燈期）。 */
export function MyQrEntry({ className }: MyQrEntryProps) {
  const { user } = useContext(UserContext);

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">我的推薦碼</p>
        <p
          data-testid="my-referral-code"
          className="truncate font-mono text-lg font-semibold tracking-wider text-purple-600"
        >
          {user?.referralCode}
        </p>
      </div>
      <div className="ml-auto shrink-0">
        <Button variant="outline" size="sm" data-testid="my-qr-button">
          <QrCode className="mr-1 h-4 w-4" />
          我的 QR
        </Button>
      </div>
    </div>
  );
}
