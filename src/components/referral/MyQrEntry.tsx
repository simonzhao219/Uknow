import { useContext, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { QrCode, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { UserContext } from '../../App';
import { JoinReferralProgramDialog } from './JoinReferralProgramDialog';
import { availableMyQrTabs } from '../../utils/myQrTabPreference';

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

interface MyQrEntryProps {
  /** 外框樣式依版面脈絡給。狀態與行為一律由本元件決定——刻意不開任何行為 prop。 */
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
 * 「我的推薦碼 ＋ 我的 QR」的**唯一**入口——會員中心與推薦管理兩頁都只放這一顆。
 *
 * 為什麼要收成元件而不是各頁各寫：前一版把它拆成兩份幾乎相同的 JSX（會員中心用
 * MyQrDialog、推薦管理用 InviteFriendButton），靠 docstring 宣稱「兩處共用、行為
 * 一致」。3967f69 只換掉會員中心那一份之後，宣稱就失效了——推薦管理漏掉未加入
 * 推薦計畫的 gating，把推薦碼提前印給使用者看。註解不會編譯失敗，元件會。
 *
 * 所以這裡刻意**不開任何行為 prop**：joined / referralCode / accountStatus 全部
 * 由元件自己從單一來源取，呼叫端連傳錯的機會都沒有。className 只影響外框、
 * onJoined 只是副作用掛鉤、yieldsGuide 只降按鈕的視覺權重，三者都無法造成兩頁行為分歧。
 *
 * 狀態一律取自 UserContext（`/profile`）——推薦碼、是否已加入、會籍狀態都在那裡，
 * 而它同時是 refreshUser() 維護的那一份。推薦網絡端點也回一份 userReferralCode，
 * 但兩份快取的更新時機不同，加入推薦計畫後會出現一頁已更新、一頁還是舊值。
 *
 * 會籍狀態刻意**不用** useSubscription，理由同上：單一來源。這裡要的是與推薦碼、
 * 加入狀態同一份 `/profile` 快照（refreshUser() 會一起更新），換成另一個端點的
 * 快取，加入或續約後就可能一個已更新、一個還是舊值。（早年另一個理由——同頁第二個
 * 實例會被 dedupe 餓死——已由 useSubscription 的 adoptShared 修掉。）
 */
export function MyQrEntry({ className, onJoined, yieldsGuide = false }: MyQrEntryProps) {
  const { user, refreshUser } = useContext(UserContext);
  const location = useLocation();
  const [joinOpen, setJoinOpen] = useState(false);

  // 碼在付款成功時就已產生（process_successful_payment），但「加入推薦計畫」才是
  // 簽了參加契約書的憑據——沒加入就不該看到自己的碼，更不該拿去邀請人。
  // 判斷式問 availableMyQrTabs（它同時決定「我的 QR」頁有沒有邀請分頁）：這條規則
  // 在本專案被複製成兩份的後果就是 3967f69 那次事故。
  const canShowCode = availableMyQrTabs({
    joined: user?.referralProgramJoined,
    referralCode: user?.referralCode,
    canScan: false,
  }).invite;

  const openJoin = () => setJoinOpen(true);

  const handleJoinSuccess = async () => {
    setJoinOpen(false);
    // 重抓 /profile 取代手刻的 setUser + localStorage——加入成功會同時改動
    // referralProgramJoined / referralCode / referralSignatureUrl，逐欄補寫遲早漏。
    await refreshUser();
    onJoined?.();
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">我的推薦碼</p>
        {canShowCode ? (
          <p
            data-testid="my-referral-code"
            className="truncate font-mono text-lg font-semibold tracking-wider text-primary"
          >
            {user.referralCode}
          </p>
        ) : (
          <Button
            tone={yieldsGuide ? 'secondary' : 'guide'}
            size="sm"
            className="mt-1"
            onClick={openJoin}
            data-testid="join-referral-button"
          >
            <Shield className="mr-1 h-4 w-4" />
            加入推薦計畫
          </Button>
        )}
      </div>

      <div className="ml-auto shrink-0">
        {/* 連結而不是按鈕：可長按開新分頁、可被預熱，也讓返回鍵知道來源。 */}
        <Button asChild tone="secondary" size="sm">
          <Link
            to="/dashboard/qr"
            state={{ from: location.pathname }}
            data-testid="my-qr-button"
            onPointerEnter={preheatMyQrPage}
            onTouchStart={preheatMyQrPage}
            onFocus={preheatMyQrPage}
          >
            <QrCode className="mr-1 h-4 w-4" />
            我的 QR
          </Link>
        </Button>
      </div>

      <JoinReferralProgramDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onSuccess={handleJoinSuccess}
      />
    </div>
  );
}
