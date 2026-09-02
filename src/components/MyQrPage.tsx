import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, QrCode, ScanLine, Share2, Shield } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from './ui/utils';
import { UserContext } from '../App';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { InviteFriendPanelContent } from './referral/InviteFriendPanelContent';
import { MemberVerifyQrTab } from './referral/MemberVerifyQrTab';
import { MemberVerifyScanner } from './referral/MemberVerifyScanner';
import {
  availableMyQrTabs,
  type MyQrTab,
  normalizeMyQrTab,
  readMyQrTab,
  resolveMyQrTab,
  writeMyQrTab,
} from '../utils/myQrTabPreference';

/**
 * 返回鍵只接受這幾個來源。`location.state` 是呼叫端塞進去的字串——讓它直接決定
 * 導向目標，等於把「使用者按返回會去哪」交給任何做得出連結的人。
 */
const BACK_WHITELIST = ['/dashboard', '/referrals', '/admin'];

/**
 * 「我的 QR」——所有 QR 相關的事都在這一頁（規格 §3、§13.1）。
 *
 * 為什麼是獨立路由而不是對話框：掃描分頁要開相機，而相機需要全螢幕的沉浸感與
 * 裝置權限——規格 §13 的判準本來就說這種即時互動走獨立路由。原本那條路由在
 * admin 區（`/admin/verify`），掃描開放給會籍有效的會員之後搬到會員區，舊網址
 * 轉址過來。
 *
 * 這一頁自己只決定四件事：**哪些分頁存在、開頁停在哪、切換之後記住什麼、返回鍵
 * 回哪裡**。三個分頁的內容各自是獨立元件，各有自己的測試。
 */
export function MyQrPage() {
  const { user } = useContext(UserContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const goUpOneLevel = useBackNavigation();

  // 與後端 POST /members/verify 的授權同一把尺：管理員（可能沒有訂閱）或會籍
  // 有效的會員。前端這份只是門面——真正的邊界在那支 handler 裡。
  const canScan = user?.isAdmin === true || user?.accountStatus === 'active';
  const {
    invite: canInvite,
    verify: canVerify,
    scan: canScanTab,
  } = availableMyQrTabs({
    joined: user?.referralProgramJoined,
    referralCode: user?.referralCode,
    canScan,
  });
  const visibleCount = [canInvite, canVerify, canScanTab].filter(Boolean).length;
  const requestedTab = searchParams.get('tab');

  const [tab, setTab] = useState<MyQrTab>(() =>
    resolveMyQrTab(
      { invite: canInvite, verify: canVerify, scan: canScanTab },
      requestedTab,
      readMyQrTab(),
    ),
  );

  // user 是非同步載入的：冷啟動直接開這一頁時，第一次 render 的可用分頁可能還
  // 全是 false（profile 還沒回來）。分頁到位後要重新決定停在哪，否則使用者會
  // 停在「當時唯一存在的」驗證碼分頁上，而他其實有偏好。
  useEffect(() => {
    setTab(
      resolveMyQrTab(
        { invite: canInvite, verify: canVerify, scan: canScanTab },
        requestedTab,
        readMyQrTab(),
      ),
    );
  }, [canInvite, canVerify, canScanTab, requestedTab]);

  const handleTabChange = (value: string) => {
    const next = normalizeMyQrTab(value);
    setTab(next);
    writeMyQrTab(next);
    // replace：切分頁不該在瀏覽器歷史堆出一疊，但網址要跟著走——重新整理、
    // 把連結傳給別人時才會停在同一個分頁上。
    setSearchParams({ tab: next }, { replace: true });
  };

  const from = (location.state as { from?: unknown } | null)?.from;
  const handleBack = () => {
    if (typeof from === 'string' && BACK_WHITELIST.includes(from)) {
      navigate(from);
      return;
    }
    goUpOneLevel();
  };

  // 三個分頁時 375px 只放得下約 94px 的文字，「會員驗證碼」＋圖示＋間距約 92px
  // ——餘裕 2px 不可靠，圖示先退場。兩個分頁時每格約 168px，沒有理由陪著降級。
  const iconClass = cn('h-4 w-4', visibleCount === 3 && 'hidden sm:inline');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="shrink-0"
          aria-label="返回上一頁"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <QrCode className="h-6 w-6" aria-hidden="true" />
            我的 QR
          </h1>
          {/* 手機隱藏副標：第一屏的每一像素都要留給 QR 與取景框。各分頁自己那句
              說明不得與這裡重複——重複等於把同一件事講兩遍，還把 QR 擠下去。 */}
          <p className="hidden text-sm text-muted-foreground sm:block">
            邀請好友、出示驗證碼、掃描驗證
          </p>
        </div>
      </div>

      {/* activationMode="manual"：Radix 預設是 automatic——方向鍵移到哪就切到哪。
          疊上「切到掃描分頁就開相機」，只是想用鍵盤瀏覽分頁的人會被原生權限
          對話框打斷。只改這個實例，不動 ui/tabs.tsx 基底（全站其他分頁沒有
          這個副作用）。 */}
      <Tabs value={tab} onValueChange={handleTabChange} activationMode="manual">
        {visibleCount > 1 ? (
          // 四個 class 缺一不可（同 AdminDashboard 的實測）：TabsList 原語 base 是
          // inline-flex/w-fit/flex，少了無前綴的 grid 則 grid-cols-* 無效、少了
          // w-full 容器縮成內容寬、少了 h-auto 放不下 44px 的觸控目標。
          <TabsList
            className={cn(
              'w-full grid h-auto pointer-coarse:[&>[role=tab]]:min-h-[44px]',
              visibleCount === 3 ? 'grid-cols-3' : 'grid-cols-2',
            )}
          >
            {canInvite ? (
              <TabsTrigger value="invite" className="gap-1" data-testid="invite-tab">
                <Share2 className={iconClass} aria-hidden="true" />
                邀請好友
              </TabsTrigger>
            ) : null}
            {canVerify ? (
              <TabsTrigger value="verify" className="gap-1" data-testid="verify-tab">
                <Shield className={iconClass} aria-hidden="true" />
                會員驗證碼
              </TabsTrigger>
            ) : null}
            {canScanTab ? (
              <TabsTrigger value="scan" className="gap-1" data-testid="scan-tab">
                <ScanLine className={iconClass} aria-hidden="true" />
                掃描驗證
              </TabsTrigger>
            ) : null}
          </TabsList>
        ) : null}

        {canInvite ? (
          <TabsContent value="invite" className="pt-4">
            <InviteFriendPanelContent referralCode={user?.referralCode} memberName={user?.name} />
          </TabsContent>
        ) : null}

        <TabsContent value="verify" className="pt-4">
          {/* active 只在這個分頁被選取時為真：沒被選到就不取碼、不輪替。 */}
          <MemberVerifyQrTab active={tab === 'verify'} accountStatus={user?.accountStatus} />
        </TabsContent>

        {canScanTab ? (
          <TabsContent value="scan" className="pt-4">
            {/* Radix 只掛載 active 面板，所以相機在切到這個分頁時才開、切走就關。 */}
            <MemberVerifyScanner />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
