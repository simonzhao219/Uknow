import { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { QrCode } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { UserContext } from '../../App';
import { myQrTabsForUser, visibleMyQrTabCount } from '../../utils/myQrTabPreference';

/**
 * 預熱「我的 QR」頁的 chunk。對話框時代點下去是零網路的本地切換，改成路由之後
 * 多了一次 chunk 下載——而最典型的情境正是「對方當面等你出示驗證碼」，全流程
 * 最不能轉圈的一刻，使用者又多在 LINE 內建瀏覽器裡。
 * 同一個模組的動態 import 回同一個 promise，所以這裡抓過之後路由層是即時的。
 */
const preheatMyQrPage = () => {
  import('../MyQrPage').catch(() => {
    /* 預熱失敗無所謂：路由層的 lazy 會自己再抓一次 */
  });
};

/**
 * 「我的 QR」入口——會員中心與推薦管理的標題列右端都放這一顆（推薦入口三顆
 * 共用元件之一，業主 2026-10-17「重複的設計共用同一份程式」）。樣式同後台頁標題旁的
 * 「會員驗證」：次要鈕；手機純圖示（觸控 44px 見方），md 起圖示＋文字。
 *
 * 顯示條件與「我的 QR」頁同一把尺（myQrTabsForUser）：有任一分頁就出現。驗證碼
 * 分頁恆存在，所以進得了這兩頁的人都看得到。
 *
 * 連結而不是按鈕：可長按開新分頁、可被預熱，也讓返回鍵知道來源（state.from）。
 */
export function MyQrButton({ className }: { className?: string }) {
  const { user } = useContext(UserContext);
  const location = useLocation();

  if (visibleMyQrTabCount(myQrTabsForUser(user)) === 0) return null;

  return (
    <Button asChild tone="secondary" className={cn('pointer-coarse:min-w-[44px]', className)}>
      <Link
        to="/dashboard/qr"
        state={{ from: location.pathname }}
        aria-label="我的 QR"
        data-testid="my-qr-button"
        onPointerEnter={preheatMyQrPage}
        onTouchStart={preheatMyQrPage}
        onFocus={preheatMyQrPage}
      >
        <QrCode className="h-4 w-4" aria-hidden="true" />
        <span className="hidden md:inline">我的 QR</span>
      </Link>
    </Button>
  );
}
