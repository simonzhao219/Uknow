import { Link, useLocation } from 'react-router-dom';
import { QrCode } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

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
 * 「我的 QR」入口——會員中心與推薦管理的標題列右端都放這一顆（推薦入口三顆共用元件
 * 之一，業主 2026-10-17「重複的設計共用同一份程式」）。樣式同後台頁標題旁的
 * 「會員驗證」：次要鈕；手機純圖示（觸控 44px 見方），md 起圖示＋文字。
 *
 * 不另做顯示判斷：兩頁與 /dashboard/qr 在同一道 RequireMembershipRoute 後面，進得了
 * 這兩頁就進得了「我的 QR」，而驗證碼分頁對所有人都在。
 *
 * 連結而不是按鈕：可長按開新分頁、可被預熱，也讓返回鍵知道來源（state.from）。
 */
export function MyQrButton({ className }: { className?: string }) {
  const location = useLocation();

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
