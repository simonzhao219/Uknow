import { useContext, useState } from 'react';
import { QrCode, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { UserContext } from '../../App';
import { MyQrDialog } from './MyQrDialog';
import { JoinReferralProgramDialog } from './JoinReferralProgramDialog';

interface MyQrEntryProps {
  /** 外框樣式依版面脈絡給。狀態與行為一律由本元件決定——刻意不開任何行為 prop。 */
  className?: string;
  /** 加入成功後的額外副作用（推薦管理頁重抓網絡）。會員狀態同步已由本元件處理。 */
  onJoined?: () => void;
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
 * onJoined 只是副作用掛鉤，兩者都無法造成兩頁行為分歧。
 *
 * 狀態一律取自 UserContext（`/profile`）——推薦碼、是否已加入、會籍狀態都在那裡，
 * 而它同時是 refreshUser() 維護的那一份。推薦網絡端點也回一份 userReferralCode，
 * 但兩份快取的更新時機不同，加入推薦計畫後會出現一頁已更新、一頁還是舊值。
 *
 * 會籍狀態刻意**不用** useSubscription：那個 hook 的 dedupe 只會跑「先到者」的
 * fetchStatus，同一頁掛第二個實例時，後到的那個自己的 setState 永遠不會執行。
 * React 的 effect 子先父後，所以本元件（子）會把會員中心（父）那份餓死，
 * SubscriptionStatusCard 就永遠停在載入中（e2e 的 free_renewal_year 情境抓到）。
 */
export function MyQrEntry({ className, onJoined }: MyQrEntryProps) {
  const { user, refreshUser } = useContext(UserContext);
  const [qrOpen, setQrOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  // 碼在付款成功時就已產生（process_successful_payment），但「加入推薦計畫」才是
  // 簽了推廣獎勵契約書的憑據——沒加入就不該看到自己的碼，更不該拿去邀請人。
  const canShowCode = !!user?.referralProgramJoined && !!user?.referralCode;

  const openJoin = () => {
    // 先關 QR 面板再開加入流程：JoinReferralProgramDialog 是手刻的 fixed z-50
    // 遮罩，MyQrDialog 是 Radix Dialog（portal 到 body、同樣 z-50），兩者疊在
    // 一起時 Radix 這層會蓋住加入流程並吃掉點擊，使用者按不到簽名與同意條款。
    setQrOpen(false);
    setJoinOpen(true);
  };

  const handleJoinSuccess = async () => {
    setJoinOpen(false);
    // 重抓 /profile 取代手刻的 setUser + localStorage——加入成功會同時改動
    // referralProgramJoined / referralCode / referralSignatureUrl，逐欄補寫遲早漏。
    await refreshUser();
    onJoined?.();
  };

  // 「我的 QR」與左側內容永遠緊鄰成一組，不用 ml-auto 推到兩端——推到兩端在寬
  // 螢幕會讓按鈕飄到卡片最右緣、與推薦碼視覺上斷開，看不出是同一件事的兩個入口。
  const qrButton = (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={() => setQrOpen(true)}
      data-testid="my-qr-button"
    >
      <QrCode className="mr-1 h-4 w-4" />
      我的 QR
    </Button>
  );

  return (
    <div className={cn('min-w-0', className)}>
      {canShowCode ? (
        // 有碼：標籤＋值，與同一張卡片的姓名／電話／Email 三格同節奏。
        <>
          <p className="text-sm text-muted-foreground">我的推薦碼</p>
          <div className="flex flex-wrap items-center gap-2">
            <p
              data-testid="my-referral-code"
              className="truncate font-mono text-lg font-semibold tracking-wider text-purple-600"
            >
              {user.referralCode}
            </p>
            {qrButton}
          </div>
        </>
      ) : (
        // 沒碼：不掛「我的推薦碼」標籤——沒有值可標，標籤配一顆 CTA 會讀成
        // 「我的推薦碼＝這顆按鈕」。此態就是單純的兩個動作，同高、緊鄰、成組：
        // 紫色實心是主要動作，QR 外框是次要，標準的 primary/secondary 配對。
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="shrink-0 bg-purple-600 text-white hover:bg-purple-700"
            onClick={openJoin}
            data-testid="join-referral-button"
          >
            <Shield className="mr-1 h-4 w-4" />
            加入推薦計畫
          </Button>
          {qrButton}
        </div>
      )}

      <MyQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        joined={!!user?.referralProgramJoined}
        referralCode={user?.referralCode}
        memberName={user?.name}
        accountStatus={user?.accountStatus}
        onRequestJoin={openJoin}
      />

      <JoinReferralProgramDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onSuccess={handleJoinSuccess}
      />
    </div>
  );
}
